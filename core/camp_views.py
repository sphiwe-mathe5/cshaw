import uuid
import random
import threading
import io
import logging
import sys
import qrcode
from datetime import datetime
from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import render, redirect
from django.contrib.auth import get_user_model
from django.conf import settings
from django.template.loader import render_to_string
from django.http import HttpResponse, HttpResponseForbidden
from .models import CampTicket, CampLeaderboardSnapshot, VolunteerActivity, ActivitySignup
from .audit import log_audit_event
from users.services import BackgroundEmailService
from lms.models import StudentProgress

logger = logging.getLogger('core.camp')
User = get_user_model()

MAX_CAMP_SEATS = 78
RSVP_DEADLINE = "Friday, 2 October 2026, 16:00"
HOURS_CLOSURE_DATE = "Monday, 28 September 2026"
CAMP_DATES = "17 – 18 October 2026"
CAMP_THEME = "Black Elegance"
CAMP_VENUE = "TBA (Venue to be confirmed)"


def build_year_in_review_stats(student, rank=1, locked_hours=0.0):
    """
    Dynamically aggregates a student's personal year-in-review journey:
    - Verified volunteer hours
    - LMS modules mastered
    - Major campus volunteer drives attended
    - Distinction / Honor title
    """
    # 1. Hours
    hours_val = locked_hours if locked_hours > 0 else float(getattr(student, 'total_hours', 0.0))
    
    # 2. LMS Mastery
    completions = StudentProgress.objects.filter(user=student).select_related('quiz__learning_unit__topic')
    topic_titles = []
    for cp in completions:
        try:
            topic_name = cp.quiz.learning_unit.topic.title
            if topic_name not in topic_titles:
                topic_titles.append(topic_name)
        except Exception:
            pass
            
    if len(topic_titles) >= 3:
        lms_summary = f"All Core Modules Completed ({', '.join(topic_titles[:2])} + {len(topic_titles)-2} more)"
    elif len(topic_titles) > 0:
        lms_summary = f"{len(topic_titles)} Hub Modules Completed ({', '.join(topic_titles[:2])})"
    else:
        lms_summary = "Learning Hub Curriculum Active"

    # 3. Major Drives Attended
    attended_signups = ActivitySignup.objects.filter(user=student, attended=True).select_related('activity')
    drives_count = attended_signups.count()
    activity_titles = []
    for s in attended_signups:
        if s.activity and s.activity.title not in activity_titles:
            activity_titles.append(s.activity.title)
            
    if activity_titles:
        drives_summary = f"{drives_count} Major Drives Attended ({', '.join(activity_titles[:3])})"
    else:
        drives_summary = f"{drives_count} Campus Activations Attended"

    # 4. Honor & Distinction Title
    is_senior = getattr(student, 'volunteer_status', '') == 'SENIOR'
    if rank <= 5:
        honor_title = "Top 5 Impact Leader • Senior Peer Educator" if is_senior else "Top 5 Impact Leader • Peer Educator"
    elif rank <= 20:
        honor_title = "Top 20 Campus Contributor • Senior Peer Educator" if is_senior else "Top 20 Campus Contributor • Peer Educator"
    elif is_senior:
        honor_title = "Senior Peer Educator — Class of 2026"
    else:
        honor_title = "Peer Educator — Class of 2026"

    return {
        'hours': hours_val,
        'lms_summary': lms_summary,
        'drives_count': drives_count,
        'drives_summary': drives_summary,
        'honor_title': honor_title,
    }


def generate_and_email_camp_tickets(tickets_data):
    """
    Background worker: generates secure QR codes and sends VIP Black Elegance email invitations.
    """
    for data in tickets_data:
        user = data['user']
        ticket = data['ticket']
        
        try:
            # 1. Generate QR Code image
            qr = qrcode.QRCode(version=1, box_size=10, border=4)
            qr.add_data(f"CAMP:{ticket.ticket_uuid}")
            qr.make(fit=True)
            img = qr.make_image(fill_color="#0a0a0c", back_color="#ffffff")
            
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            
            # Save ImageField to ticket
            ticket.qr_code.save(f"camp_ticket_{ticket.ticket_uuid}.png", ContentFile(buffer.getvalue()), save=True)
            qr_url = ticket.qr_code.url if ticket.qr_code else ""
            
            attendee_name = f"{user.first_name} {user.last_name}".strip() or user.email
            campus_name = getattr(user, 'campus', '') or 'Main Campus'
            
            context = {
                'first_name': user.first_name or "Peer Educator",
                'attendee_name': attendee_name,
                'campus': campus_name,
                'hours': f"{ticket.locked_hours:.1f}",
                'pin': ticket.fallback_pin,
                'qr_url': qr_url,
                'cohort_rank': ticket.cohort_rank,
                'honor_title': ticket.honor_title,
                'lms_summary': ticket.lms_modules_summary,
                'drives_summary': ticket.major_drives_summary or f"{ticket.drives_attended_count} Campus Drives",
                'event_title': 'PEER EDUCATION YEAR-END CAMP 2026',
                'event_theme': CAMP_THEME,
                'event_dates': CAMP_DATES,
                'event_venue': CAMP_VENUE,
                'rsvp_deadline': RSVP_DEADLINE,
                'closure_date': HOURS_CLOSURE_DATE,
            }
            
            # Render HTML content
            html_content = render_to_string('core/camp_ticket_email.html', context)
            
            # Send Email via BackgroundEmailService
            BackgroundEmailService._send_async(
                subject=f"👑 Official Ticket: Peer Education Year-End Camp 2026 — Black Elegance (Rank #{ticket.cohort_rank}) 🏕️",
                to_emails=[user.email],
                html_content=html_content
            )
            logger.info("Sent Camp Ticket email to %s (PIN: %s, Rank: #%d)", user.email, ticket.fallback_pin, ticket.cohort_rank)
        except Exception as e:
            logger.exception("Failed to generate/send camp ticket for %s: %s", user.email, str(e))


class GenerateCampTicketsAPIView(APIView):
    """
    POST /api/camp/generate/
    Generates tickets for the top 78 Peer Educators by accumulated hours.
    Locks hours into CampLeaderboardSnapshot upon first generation.
    """
    def post(self, request):
        if not request.user.is_authenticated or (request.user.role != 'COORDINATOR' and not request.user.is_superuser):
            return Response({'error': 'Unauthorized. Coordinators only.'}, status=status.HTTP_403_FORBIDDEN)
            
        # 1. Check if snapshot exists. If not, initial generation locks student hours!
        if not CampLeaderboardSnapshot.objects.exists():
            all_students = list(User.objects.filter(role='STUDENT', is_active=True))
            snapshots_to_create = []
            for s in all_students:
                snapshots_to_create.append(
                    CampLeaderboardSnapshot(user=s, locked_hours=float(getattr(s, 'total_hours', 0.0)))
                )
            CampLeaderboardSnapshot.objects.bulk_create(snapshots_to_create)
            logger.info("Created CampLeaderboardSnapshot for %d students", len(snapshots_to_create))
            
        # Revoke any active/confirmed tickets for students who are marked is_camp_eligible=False
        CampTicket.objects.filter(user__is_camp_eligible=False, status__in=['active', 'confirmed']).update(status='revoked')

        # 2. Count current active/confirmed tickets
        active_tickets = CampTicket.objects.filter(status__in=['active', 'confirmed'])
        active_count = active_tickets.count()
        seats_to_fill = MAX_CAMP_SEATS - active_count
        
        if seats_to_fill <= 0:
            return Response({
                'message': f'All {MAX_CAMP_SEATS} camp seats are already filled ({active_count}/{MAX_CAMP_SEATS}).',
                'generated': 0,
                'seats_filled': active_count,
                'max_seats': MAX_CAMP_SEATS
            }, status=status.HTTP_200_OK)
            
        # 3. Read students from snapshot ordered by locked_hours descending
        snapshots = CampLeaderboardSnapshot.objects.select_related('user').filter(user__is_active=True).order_by('-locked_hours', 'created_at')
        existing_tickets = CampTicket.objects.all()
        users_with_tickets = {t.user_id: t for t in existing_tickets}
        
        eligible_candidates = []
        rank_counter = 1
        for snap in snapshots:
            if not getattr(snap.user, 'is_camp_eligible', True):
                continue
            ticket = users_with_tickets.get(snap.user_id)
            if not ticket:
                eligible_candidates.append((snap, rank_counter))
            elif ticket.status == 'revoked':
                # Student previously forfeited seat or was disqualified, skip
                rank_counter += 1
                continue
            elif ticket.status in ['active', 'confirmed']:
                rank_counter += 1
                continue
            rank_counter += 1
            
        selected_candidates = eligible_candidates[:seats_to_fill]
        if not selected_candidates:
            return Response({
                'message': 'No eligible students found to fill remaining camp seats.',
                'generated': 0,
                'seats_filled': active_count,
                'max_seats': MAX_CAMP_SEATS
            }, status=status.HTTP_200_OK)
            
        tickets_data = []
        for snap, rank in selected_candidates:
            student = snap.user
            # Generate unique 6-digit PIN
            pin = ''.join(random.choices('0123456789', k=6))
            while CampTicket.objects.filter(fallback_pin=pin).exists():
                pin = ''.join(random.choices('0123456789', k=6))
                
            stats = build_year_in_review_stats(student, rank=rank, locked_hours=snap.locked_hours)
            
            ticket = CampTicket.objects.create(
                user=student,
                fallback_pin=pin,
                status='active',
                locked_hours=snap.locked_hours,
                cohort_rank=rank,
                honor_title=stats['honor_title'],
                lms_modules_summary=stats['lms_summary'],
                drives_attended_count=stats['drives_count'],
                major_drives_summary=stats['drives_summary']
            )
            tickets_data.append({'user': student, 'ticket': ticket})
            
        # Spawn worker thread for QR generation and emails (or synchronous during test runs)
        if 'test' in sys.argv:
            generate_and_email_camp_tickets(tickets_data)
        else:
            thread = threading.Thread(target=generate_and_email_camp_tickets, args=(tickets_data,))
            thread.start()
        
        log_audit_event(
            action="CAMP_TICKETS_GENERATED",
            actor=request.user,
            target_type="CampTicket",
            target_id="",
            metadata={"generated_count": len(tickets_data), "total_seats": MAX_CAMP_SEATS}
        )
        
        return Response({
            'message': f'Successfully issued {len(tickets_data)} Year-End Camp tickets based on verified volunteer hours. Emails are being delivered in the background.',
            'generated': len(tickets_data),
            'seats_filled': active_count + len(tickets_data),
            'max_seats': MAX_CAMP_SEATS
        }, status=status.HTTP_200_OK)


class MyCampTicketAPIView(APIView):
    """
    GET /api/camp/my-ticket/
    Returns the current student's Camp & Completion Ticket with live Year-in-Review data.
    """
    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        if not getattr(request.user, 'is_camp_eligible', True):
            return Response({
                'has_ticket': False,
                'is_revoked': False,
                'is_ineligible': True,
                'message': 'You are currently marked as ineligible for the Year-End Camp. Please consult with your coordinator if you believe this is an error.'
            }, status=status.HTTP_200_OK)

        ticket = CampTicket.objects.filter(user=request.user, status__in=['active', 'confirmed']).first()
        if not ticket:
            revoked_ticket = CampTicket.objects.filter(user=request.user, status='revoked').first()
            if revoked_ticket:
                return Response({
                    'has_ticket': False,
                    'is_revoked': True,
                    'message': 'Your RSVP for the Year-End Camp was cancelled. Your seat was graciously offered to the next Peer Educator on the leaderboard.'
                }, status=status.HTTP_200_OK)
            return Response({
                'has_ticket': False,
                'is_revoked': False,
                'message': 'Tickets for the Year-End Camp: Black Elegance are awarded exclusively to the top 78 Peer Educators based on verified volunteer hours.'
            }, status=status.HTTP_200_OK)
            
        qr_url = ticket.qr_code.url if ticket.qr_code else ""
        attendee_name = f"{ticket.user.first_name} {ticket.user.last_name}".strip() or ticket.user.email
        
        # Real-time stats fallback if needed
        hours_display = ticket.locked_hours if ticket.locked_hours > 0 else float(getattr(ticket.user, 'total_hours', 0.0))
        stats = build_year_in_review_stats(ticket.user, rank=ticket.cohort_rank, locked_hours=hours_display)
        
        return Response({
            'has_ticket': True,
            'ticket': {
                'id': ticket.id,
                'ticket_uuid': str(ticket.ticket_uuid),
                'fallback_pin': ticket.fallback_pin,
                'qr_url': qr_url,
                'status': ticket.status,
                'is_scanned': ticket.is_scanned,
                'scanned_at': ticket.scanned_at.strftime('%d %b %Y, %H:%M') if ticket.scanned_at else None,
                'cohort_rank': ticket.cohort_rank,
                'honor_title': ticket.honor_title or stats['honor_title'],
                'lms_modules_summary': ticket.lms_modules_summary or stats['lms_summary'],
                'drives_attended_count': ticket.drives_attended_count or stats['drives_count'],
                'major_drives_summary': ticket.major_drives_summary or stats['drives_summary'],
                'tshirt_size': ticket.tshirt_size or getattr(ticket.user, 'tshirt_size', '') or "M",
                'event_title': 'PEER EDUCATION YEAR-END CAMP 2026',
                'event_theme': CAMP_THEME,
                'event_dates': CAMP_DATES,
                'event_venue': CAMP_VENUE,
                'rsvp_deadline': RSVP_DEADLINE,
                'closure_date': HOURS_CLOSURE_DATE,
                'attendee_name': attendee_name,
                'campus': getattr(ticket.user, 'campus', '') or 'Main Campus',
                'locked_hours': f"{hours_display:.1f}",
            }
        }, status=status.HTTP_200_OK)


class CancelCampRsvpAPIView(APIView):
    """
    POST /api/camp/cancel-rsvp/
    Allows student to cancel their RSVP before the deadline (Friday 2 October 2026, 16:00),
    or allows a coordinator to revoke a ticket.
    """
    def post(self, request):
        if not request.user.is_authenticated:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
            
        ticket_id = request.data.get('ticket_id')
        is_coordinator = (request.user.role == 'COORDINATOR' or request.user.is_superuser)
        
        try:
            if ticket_id and is_coordinator:
                ticket = CampTicket.objects.get(id=ticket_id)
            elif ticket_id:
                ticket = CampTicket.objects.get(id=ticket_id, user=request.user, status__in=['active', 'confirmed'])
            else:
                ticket = CampTicket.objects.get(user=request.user, status__in=['active', 'confirmed'])
        except CampTicket.DoesNotExist:
            return Response({'error': 'Active camp ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        ticket.status = 'revoked'
        ticket.save()
        
        log_audit_event(
            action="CAMP_TICKET_REVOKED",
            actor=request.user,
            target_type="CampTicket",
            target_id=ticket.id,
            metadata={
                "student_email": ticket.user.email,
                "pin": ticket.fallback_pin,
                "rank": ticket.cohort_rank,
                "revoked_by": "STUDENT_SELF_CANCEL" if not is_coordinator else "COORDINATOR"
            }
        )
        logger.info("Camp Ticket %s (User: %s) revoked by %s", ticket.fallback_pin, ticket.user.email, request.user.email)
        
        return Response({
            'message': 'Your RSVP for the Year-End Camp has been cancelled. Your seat has been released for the next Peer Educator.',
            'status': 'success'
        }, status=status.HTTP_200_OK)


class ConfirmCampAttendanceAPIView(APIView):
    """
    POST /api/camp/confirm/
    Student confirms attendance, optionally updating T-Shirt size.
    """
    def post(self, request):
        if not request.user.is_authenticated:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
            
        try:
            ticket = CampTicket.objects.get(user=request.user, status__in=['active', 'confirmed'])
        except CampTicket.DoesNotExist:
            return Response({'error': 'Active camp ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        tshirt = request.data.get('tshirt_size')
        
        if tshirt is not None:
            ticket.tshirt_size = str(tshirt).strip()[:10]
            # also sync to user profile
            request.user.tshirt_size = ticket.tshirt_size
            request.user.save(update_fields=['tshirt_size'])
            
        ticket.status = 'confirmed'
        ticket.save()
        
        log_audit_event(
            action="CAMP_TICKET_CONFIRMED",
            actor=request.user,
            target_type="CampTicket",
            target_id=ticket.id,
            metadata={
                "student_email": ticket.user.email,
                "pin": ticket.fallback_pin,
                "tshirt": ticket.tshirt_size
            }
        )
        
        return Response({
            'message': 'Thank you! Your attendance for the Year-End Camp has been confirmed.',
            'status': 'confirmed',
            'tshirt_size': ticket.tshirt_size
        }, status=status.HTTP_200_OK)


class ValidateCampTicketAPIView(APIView):
    """
    POST /api/camp/validate/
    Used by departure coordinators / scanner dashboard to check in campers via QR UUID or 6-digit PIN.
    """
    def post(self, request):
        if not request.user.is_authenticated or (request.user.role != 'COORDINATOR' and not request.user.is_superuser):
            return Response({'error': 'Unauthorized. Coordinators only.'}, status=status.HTTP_403_FORBIDDEN)
            
        identifier = str(request.data.get('identifier', '')).strip()
        if not identifier:
            return Response({'error': 'No QR code or PIN provided.'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Clean prefix if QR data contains "CAMP:"
        if identifier.startswith('CAMP:'):
            identifier = identifier.replace('CAMP:', '', 1).strip()
            
        ticket = None
        # Try UUID
        try:
            parsed_uuid = uuid.UUID(identifier)
            ticket = CampTicket.objects.select_related('user').filter(ticket_uuid=parsed_uuid).first()
        except (ValueError, AttributeError):
            pass
            
        # Try PIN
        if not ticket:
            ticket = CampTicket.objects.select_related('user').filter(fallback_pin=identifier).first()
            
        if not ticket:
            return Response({
                'valid': False,
                'message': f"No camp ticket found matching '{identifier}'."
            }, status=status.HTTP_404_NOT_FOUND)
            
        if not getattr(ticket.user, 'is_camp_eligible', True):
            return Response({
                'valid': False,
                'is_revoked': True,
                'message': f"Access Denied: Attendee ({ticket.user.get_full_name() or ticket.user.email}) is marked as ineligible for the Year-End Camp.",
                'attendee_name': f"{ticket.user.first_name} {ticket.user.last_name}".strip() or ticket.user.email,
            }, status=status.HTTP_200_OK)

        if ticket.status == 'revoked':
            return Response({
                'valid': False,
                'is_revoked': True,
                'message': f"This ticket ({ticket.fallback_pin}) was CANCELLED/REVOKED. Seat has been reallocated.",
                'attendee_name': f"{ticket.user.first_name} {ticket.user.last_name}".strip() or ticket.user.email,
            }, status=status.HTTP_200_OK)
            
        if ticket.is_scanned:
            return Response({
                'valid': True,
                'already_scanned': True,
                'message': f"Ticket already verified on {ticket.scanned_at.strftime('%d %b %Y, %H:%M') if ticket.scanned_at else 'earlier'}.",
                'attendee_name': f"{ticket.user.first_name} {ticket.user.last_name}".strip() or ticket.user.email,
                'campus': getattr(ticket.user, 'campus', 'Main Campus'),
                'pin': ticket.fallback_pin,
                'cohort_rank': ticket.cohort_rank,
                'honor_title': ticket.honor_title,
                'scanned_at': ticket.scanned_at.strftime('%d %b %Y, %H:%M') if ticket.scanned_at else None,
            }, status=status.HTTP_200_OK)
            
        # Mark as scanned
        ticket.is_scanned = True
        ticket.scanned_at = timezone.now()
        ticket.save(update_fields=['is_scanned', 'scanned_at'])
        
        log_audit_event(
            action="CAMP_TICKET_VERIFIED",
            actor=request.user,
            target_type="CampTicket",
            target_id=ticket.id,
            metadata={
                "student_email": ticket.user.email,
                "pin": ticket.fallback_pin,
                "cohort_rank": ticket.cohort_rank
            }
        )
        
        return Response({
            'valid': True,
            'already_scanned': False,
            'message': 'Camp Ticket verified successfully! Welcome to Black Elegance 2026.',
            'attendee_name': f"{ticket.user.first_name} {ticket.user.last_name}".strip() or ticket.user.email,
            'campus': getattr(ticket.user, 'campus', 'Main Campus'),
            'pin': ticket.fallback_pin,
            'cohort_rank': ticket.cohort_rank,
            'honor_title': ticket.honor_title,
            'scanned_at': ticket.scanned_at.strftime('%d %b %Y, %H:%M'),
        }, status=status.HTTP_200_OK)


class ResetCampTicketsAPIView(APIView):
    """
    POST /api/camp/reset/
    Coordinator only: resets all camp tickets and snapshot.
    """
    def post(self, request):
        if not request.user.is_authenticated or (request.user.role != 'COORDINATOR' and not request.user.is_superuser):
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
        ticket_count = CampTicket.objects.count()
        snapshot_count = CampLeaderboardSnapshot.objects.count()
        
        CampTicket.objects.all().delete()
        CampLeaderboardSnapshot.objects.all().delete()
        
        log_audit_event(
            action="CAMP_TICKETS_RESET",
            actor=request.user,
            target_type="CampTicket",
            target_id="",
            metadata={"deleted_tickets": ticket_count, "deleted_snapshots": snapshot_count}
        )
        logger.warning("Camp tickets and snapshots RESET by %s (Deleted %d tickets, %d snapshots)", request.user.email, ticket_count, snapshot_count)
        
        return Response({
            'message': f'Successfully reset all Year-End Camp tickets ({ticket_count} deleted) and unlocked student hours.',
            'deleted_tickets': ticket_count,
            'deleted_snapshots': snapshot_count
        }, status=status.HTTP_200_OK)


def export_camp_manifest_pdf(request):
    """
    GET /api/camp/export-manifest-pdf/
    Downloads official Black Elegance 2026 Delegate Manifest for boarding coordinators.
    Matches the comprehensive multi-part structure, demographic breakdown, and styling of the excursion manifest.
    """
    if not request.user.is_authenticated or (request.user.role != 'COORDINATOR' and not request.user.is_superuser):
        return HttpResponseForbidden("Only coordinators can download the official camp manifest.")
        
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    except ImportError:
        return HttpResponse("ReportLab is not installed.", status=500)
        
    response = HttpResponse(content_type='application/pdf')
    filename = f"CSHAW_Camp_Black_Elegance_Manifest_{timezone.now().strftime('%Y%m%d_%H%M')}.pdf"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    doc = SimpleDocTemplate(
        response,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Luxury & Black Elegance Palette
    PRIMARY_GOLD = colors.HexColor('#b45309')
    GOLD_ACCENT = colors.HexColor('#d4af37')
    DARK_NAVY = colors.HexColor('#0a0a0c')
    SLATE_GREY = colors.HexColor('#475569')
    LIGHT_BG = colors.HexColor('#f8fafc')
    BORDER_COLOR = colors.HexColor('#e2e8f0')
    GREEN_SUCCESS = colors.HexColor('#16a34a')
    RED_REVOKED = colors.HexColor('#dc2626')
    BLUE_REALLOCATED = colors.HexColor('#2563eb')
    PURPLE_CONFIRMED = colors.HexColor('#7c3aed')
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=PRIMARY_GOLD
    )
    
    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=SLATE_GREY
    )
    
    meta_style = ParagraphStyle(
        'MetaStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=DARK_NAVY
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12.5,
        leading=15,
        textColor=DARK_NAVY,
        spaceBefore=14,
        spaceAfter=6
    )

    subsection_heading = ParagraphStyle(
        'SubSectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=PRIMARY_GOLD,
        spaceBefore=8,
        spaceAfter=4
    )
    
    cell_style = ParagraphStyle(
        'CellRegular',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=DARK_NAVY
    )

    cell_bold = ParagraphStyle(
        'CellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=DARK_NAVY
    )

    cell_header = ParagraphStyle(
        'CellHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )
    
    badge_active = ParagraphStyle(
        'BadgeActive',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        textColor=GREEN_SUCCESS
    )

    badge_confirmed = ParagraphStyle(
        'BadgeConfirmed',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        textColor=PURPLE_CONFIRMED
    )

    badge_reallocated = ParagraphStyle(
        'BadgeReallocated',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        textColor=BLUE_REALLOCATED
    )

    badge_revoked = ParagraphStyle(
        'BadgeRevoked',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        textColor=RED_REVOKED
    )

    badge_scanned = ParagraphStyle(
        'BadgeScanned',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        textColor=GREEN_SUCCESS
    )

    story = []
    
    # 1. Header Banner
    header_table_data = [
        [
            Paragraph("<b>👑 C-SHAW YEAR-END CAMP 2026: BLACK ELEGANCE</b><br/><font size=8.5 color='#475569'>Official Delegate Roster & Departure Boarding Manifest</font>", title_style),
            Paragraph(f"<b>Issued:</b> {timezone.now().strftime('%d %B %Y %H:%M')}<br/><b>Camp Dates:</b> {CAMP_DATES}<br/><b>Theme:</b> {CAMP_THEME}<br/><b>Venue:</b> {CAMP_VENUE}", meta_style)
        ]
    ]
    header_table = Table(header_table_data, colWidths=[330, 193])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD_ACCENT, spaceBefore=2, spaceAfter=8))
    
    # 2. Gather Data
    all_tickets = CampTicket.objects.select_related('user').order_by('cohort_rank', 'created_at')
    active_tickets = [t for t in all_tickets if t.status in ['active', 'confirmed']]
    revoked_tickets = [t for t in all_tickets if t.status == 'revoked']
    
    initial_ticket_ids = set([t.id for t in all_tickets if t.cohort_rank <= MAX_CAMP_SEATS][:MAX_CAMP_SEATS])
    
    total_active = len(active_tickets)
    total_revoked = len(revoked_tickets)
    total_scanned = len([t for t in active_tickets if t.is_scanned])
    
    total_females = sum(1 for t in active_tickets if getattr(t.user, 'gender', '') == 'Female')
    total_males = sum(1 for t in active_tickets if getattr(t.user, 'gender', '') == 'Male')
    
    # Summary Metrics Table (5 KPIs)
    summary_data = [
        [
            Paragraph(f"<b>Target Capacity</b><br/><font size=11 color='#0f172a'><b>{MAX_CAMP_SEATS} Delegates</b></font>", cell_style),
            Paragraph(f"<b>Active Confirmed</b><br/><font size=11 color='#16a34a'><b>{total_active}</b></font>", cell_style),
            Paragraph(f"<b>Total Gender Split</b><br/><font size=10 color='#0f172a'>👩 <b>{total_females}</b> F &nbsp;|&nbsp; 👨 <b>{total_males}</b> M</font>", cell_style),
            Paragraph(f"<b>Cancelled / Revoked</b><br/><font size=11 color='#dc2626'><b>{total_revoked}</b></font>", cell_style),
            Paragraph(f"<b>Checked-In (Scanned)</b><br/><font size=11 color='#2563eb'><b>{total_scanned}</b></font>", cell_style),
        ]
    ]
    summary_table = Table(summary_data, colWidths=[100, 105, 128, 95, 95])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 1, BORDER_COLOR),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('PADDING', (0, 0), (-1, -1), 5),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 10))

    # --- CAMPUS DEMOGRAPHIC BREAKDOWN TABLE ---
    campuses_order = ['APB', 'DFC', 'APK', 'SWC', 'Other']
    campus_names = {
        'APB': 'APB Campus (Auckland Park Bunting)',
        'DFC': 'DFC Campus (Doornfontein)',
        'APK': 'APK Campus (Auckland Park Kingsway)',
        'SWC': 'SWC Campus (Soweto)',
        'Other': 'Other / Unassigned'
    }
    
    grouped_active = {}
    for c in campuses_order:
        grouped_active[c] = {'Male': [], 'Female': [], 'Other': []}
        
    for t in active_tickets:
        c = t.user.campus or 'Other'
        if c not in grouped_active:
            c = 'Other'
        g = t.user.gender or 'Other'
        if g not in ['Male', 'Female']:
            g = 'Other'
        grouped_active[c][g].append(t)
        
    campus_summary_rows = [
        [
            Paragraph("<b>Campus Location</b>", cell_header),
            Paragraph("<b>Female Delegates</b>", cell_header),
            Paragraph("<b>Male Delegates</b>", cell_header),
            Paragraph("<b>Total Delegates</b>", cell_header),
            Paragraph("<b>% of Roster</b>", cell_header),
        ]
    ]
    
    for c in campuses_order:
        c_dict = grouped_active[c]
        c_f = len(c_dict['Female'])
        c_m = len(c_dict['Male'])
        c_tot = c_f + c_m + len(c_dict['Other'])
        if c_tot > 0:
            pct = (c_tot / total_active * 100) if total_active > 0 else 0
            campus_summary_rows.append([
                Paragraph(f"<b>{c} Campus</b>", cell_bold),
                Paragraph(f"<b>{c_f}</b> Females", cell_style),
                Paragraph(f"<b>{c_m}</b> Males", cell_style),
                Paragraph(f"<b>{c_tot}</b> Delegates", cell_bold),
                Paragraph(f"{pct:.1f}%", cell_style),
            ])
            
    c_summary_table = Table(campus_summary_rows, colWidths=[140, 95, 95, 95, 98])
    c_summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), DARK_NAVY),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
    ]))
    story.append(c_summary_table)
    story.append(Spacer(1, 10))

    # --- PART 1: ACTIVE ATTENDEES (GROUPED BY CAMPUS & GENDER) ---
    story.append(Paragraph("<b>PART 1: ACTIVE DELEGATES (GROUPED BY CAMPUS & GENDER)</b>", section_heading))
    story.append(Paragraph(f"The following list represents all {total_active} confirmed delegates holding active camp passes for Black Elegance 2026, organized by Campus and Gender.", subtitle_style))
    story.append(Spacer(1, 6))
    
    overall_seq = 1
    for c in campuses_order:
        campus_dict = grouped_active[c]
        c_f = len(campus_dict['Female'])
        c_m = len(campus_dict['Male'])
        campus_total = c_f + c_m + len(campus_dict['Other'])
        if campus_total == 0:
            continue
            
        story.append(Paragraph(f"<b>📍 {campus_names[c]} &nbsp;—&nbsp; Total: {campus_total} Delegates ({c_f} Females, {c_m} Males)</b>", subsection_heading))
        
        table_rows = [
            [
                Paragraph("<b>#</b>", cell_header),
                Paragraph("<b>Rank</b>", cell_header),
                Paragraph("<b>Student Name</b>", cell_header),
                Paragraph("<b>Email</b>", cell_header),
                Paragraph("<b>Gen</b>", cell_header),
                Paragraph("<b>Size</b>", cell_header),
                Paragraph("<b>PIN</b>", cell_header),
                Paragraph("<b>Hours</b>", cell_header),
                Paragraph("<b>Status / Check-In</b>", cell_header)
            ]
        ]
        
        # Add Female first then Male then Other
        for gender_key in ['Female', 'Male', 'Other']:
            tickets_list = campus_dict[gender_key]
            for t in tickets_list:
                user = t.user
                is_reallocated = (t.cohort_rank > MAX_CAMP_SEATS) or (t.id not in initial_ticket_ids)
                
                if t.is_scanned:
                    status_label = Paragraph("<b>✓ Checked-In</b>", badge_scanned)
                elif is_reallocated:
                    status_label = Paragraph("<b>Reallocated</b>", badge_reallocated)
                elif t.status == 'confirmed':
                    status_label = Paragraph("<b>Confirmed</b>", badge_confirmed)
                else:
                    status_label = Paragraph("<b>Active</b>", badge_active)
                
                hours_disp = f"{t.locked_hours:.1f}" if t.locked_hours > 0 else f"{getattr(user, 'total_hours', 0.0):.1f}"
                tshirt_disp = t.tshirt_size or getattr(user, 'tshirt_size', '') or '—'
                
                table_rows.append([
                    Paragraph(str(overall_seq), cell_bold),
                    Paragraph(f"#{t.cohort_rank}", cell_bold),
                    Paragraph(f"<b>{user.first_name} {user.last_name}</b>", cell_style),
                    Paragraph(user.email, cell_style),
                    Paragraph(user.gender[:1] if user.gender else '—', cell_style),
                    Paragraph(tshirt_disp, cell_style),
                    Paragraph(f"#{t.fallback_pin}", cell_bold),
                    Paragraph(hours_disp, cell_style),
                    status_label
                ])
                overall_seq += 1
                
        t_table = Table(table_rows, colWidths=[20, 30, 105, 135, 35, 38, 44, 44, 72])
        t_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), DARK_NAVY),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
            ('TOPPADDING', (0, 0), (-1, -1), 3.5),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
            ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (1, -1), 'CENTER'),
            ('ALIGN', (4, 0), (5, -1), 'CENTER'),
            ('ALIGN', (7, 0), (8, -1), 'CENTER'),
        ]))
        story.append(t_table)
        story.append(Spacer(1, 8))

    # --- PART 2: CANCELLED / REVOKED / INELIGIBLE AUDIT LOG ---
    if revoked_tickets:
        story.append(Spacer(1, 8))
        story.append(Paragraph("<b>PART 2: CANCELLED RSVPs & REVOKED / INELIGIBLE TICKETS</b>", section_heading))
        story.append(Paragraph("The following students were originally allocated seats on the leaderboard but cancelled their RSVP, were disqualified, or had their tickets revoked. Their seats were reallocated to the next qualifying Peer Educators.", subtitle_style))
        story.append(Spacer(1, 6))
        
        revoked_rows = [
            [
                Paragraph("<b>#</b>", cell_header),
                Paragraph("<b>Rank</b>", cell_header),
                Paragraph("<b>Student Name</b>", cell_header),
                Paragraph("<b>Email</b>", cell_header),
                Paragraph("<b>Campus</b>", cell_header),
                Paragraph("<b>Gender</b>", cell_header),
                Paragraph("<b>Locked Hours</b>", cell_header),
                Paragraph("<b>Status / Action</b>", cell_header)
            ]
        ]
        
        for idx, rt in enumerate(revoked_tickets, 1):
            r_user = rt.user
            r_hours = f"{rt.locked_hours:.1f} hrs" if rt.locked_hours > 0 else f"{getattr(r_user, 'total_hours', 0.0):.1f} hrs"
            
            if not getattr(r_user, 'is_camp_eligible', True):
                reason_label = Paragraph("<b>Disqualified (Ineligible)</b>", badge_revoked)
            else:
                reason_label = Paragraph("<b>Cancelled / Revoked</b>", badge_revoked)
                
            revoked_rows.append([
                Paragraph(str(idx), cell_bold),
                Paragraph(f"#{rt.cohort_rank}", cell_bold),
                Paragraph(f"<b>{r_user.first_name} {r_user.last_name}</b>", cell_style),
                Paragraph(r_user.email, cell_style),
                Paragraph(r_user.campus or '—', cell_style),
                Paragraph(r_user.gender or '—', cell_style),
                Paragraph(r_hours, cell_style),
                reason_label
            ])
            
        revoked_table = Table(revoked_rows, colWidths=[20, 30, 105, 135, 48, 44, 55, 86])
        revoked_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#991b1b')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
            ('TOPPADDING', (0, 0), (-1, -1), 3.5),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fef2f2')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#fecaca')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (1, -1), 'CENTER'),
        ]))
        story.append(revoked_table)
        story.append(Spacer(1, 12))

    # --- PART 3: SIGN-OFF & COORDINATOR BOARDING VERIFICATION ---
    story.append(Spacer(1, 8))
    signoff_data = [
        [
            Paragraph("<b>Coordinator Name:</b> ___________________________", meta_style),
            Paragraph("<b>Signature:</b> ___________________________", meta_style),
            Paragraph(f"<b>Date:</b> {timezone.now().strftime('%d/%m/%Y')}", meta_style)
        ]
    ]
    signoff_table = Table(signoff_data, colWidths=[180, 180, 163])
    signoff_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(signoff_table)
    
    doc.build(story)
    return response
