import uuid
import random
import threading
import io
import qrcode
from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import render
from django.contrib.auth import get_user_model
from django.conf import settings
from django.template.loader import render_to_string
from .models import ExcursionTicket, ExcursionLeaderboardSnapshot
from users.services import BackgroundEmailService
from django.http import HttpResponseForbidden

User = get_user_model()

def generate_and_email_tickets(tickets_data):
    for data in tickets_data:
        user = data['user']
        ticket = data['ticket']
        
        # Generate QR Code image
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(str(ticket.ticket_uuid))
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save to memory
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        
        # Save ImageField to ticket (Google Cloud Storage handles it)
        ticket.qr_code.save(f"ticket_{ticket.ticket_uuid}.png", ContentFile(buffer.getvalue()), save=True)
        
        # Get public URL
        qr_url = ticket.qr_code.url if ticket.qr_code else ""
        
        attendee_name = f"{user.first_name} {user.last_name}".strip() or user.email
        campus_name = getattr(user, 'campus', '') or 'UJ Campus'
        hours_val = ticket.locked_hours if ticket.locked_hours > 0 else getattr(user, 'total_hours', 0.0)
        
        context = {
            'first_name': user.first_name,
            'attendee_name': attendee_name,
            'campus': campus_name,
            'hours': f"{hours_val:.1f}",
            'pin': ticket.fallback_pin,
            'qr_url': qr_url,
            'event_title': 'EMPOWERMENT HIKE',
            'event_date': '28 August 2026',
            'event_time': '08:00 – 16:00',
            'location': 'UJ APK Gate 2',
        }
        
        # Render HTML content
        html_content = render_to_string('core/excursion_ticket_email.html', context)
        
        # Send Email via BackgroundEmailService
        BackgroundEmailService._send_async(
            subject="🎉 You're Invited! Your Official C-SHAW Excursion Ticket is Inside! 🚌",
            to_emails=[user.email],
            html_content=html_content
        )

class GenerateTicketsAPIView(APIView):
    def post(self, request):
        if request.user.role != 'COORDINATOR':
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
        MAX_SEATS = 68
        
        # 1. Check if snapshot exists. If not, this is the INITIAL click -> Lock all student hours!
        if not ExcursionLeaderboardSnapshot.objects.exists():
            all_students = list(User.objects.filter(role='STUDENT', is_active=True))
            snapshots_to_create = []
            for s in all_students:
                snapshots_to_create.append(
                    ExcursionLeaderboardSnapshot(user=s, locked_hours=float(s.total_hours))
                )
            ExcursionLeaderboardSnapshot.objects.bulk_create(snapshots_to_create)
            
        # 2. Get active tickets
        active_tickets = ExcursionTicket.objects.filter(status='active')
        active_ticket_count = active_tickets.count()
        seats_to_fill = MAX_SEATS - active_ticket_count
        
        if seats_to_fill <= 0:
            return Response({'message': f'All seats are already filled ({MAX_SEATS}/{MAX_SEATS}).', 'generated': 0}, status=status.HTTP_200_OK)
            
        # 3. Read students strictly from the LOCKED SNAPSHOT (ordered by locked_hours descending)
        snapshots = ExcursionLeaderboardSnapshot.objects.select_related('user').filter(user__is_active=True).order_by('-locked_hours', 'created_at')
        
        existing_tickets = ExcursionTicket.objects.all()
        users_with_tickets = {t.user_id: t for t in existing_tickets}
        
        eligible_snapshots = []
        for snap in snapshots:
            ticket = users_with_tickets.get(snap.user_id)
            if not ticket:
                eligible_snapshots.append(snap)
            elif ticket.status == 'revoked':
                continue # Student already had a ticket and cancelled/revoked, skip them
            elif ticket.status == 'active':
                continue # Student already has an active ticket
                
        # Take the top `seats_to_fill` students from the locked snapshot
        selected_snapshots = eligible_snapshots[:seats_to_fill]
        
        if not selected_snapshots:
            return Response({'message': 'No eligible students found to fill remaining seats.', 'generated': 0}, status=status.HTTP_200_OK)
            
        tickets_data = []
        for snap in selected_snapshots:
            student = snap.user
            # Generate 6-digit PIN
            pin = ''.join(random.choices('0123456789', k=6))
            # Ensure unique PIN
            while ExcursionTicket.objects.filter(fallback_pin=pin).exists():
                pin = ''.join(random.choices('0123456789', k=6))
                
            ticket = ExcursionTicket.objects.create(
                user=student,
                fallback_pin=pin,
                status='active',
                locked_hours=snap.locked_hours
            )
            tickets_data.append({'user': student, 'ticket': ticket})
            
        # Spawn thread to generate QR and send emails
        thread = threading.Thread(target=generate_and_email_tickets, args=(tickets_data,))
        thread.start()
        
        return Response({
            'message': f'Successfully generated {len(tickets_data)} tickets based on locked leaderboard standing. Emails are sending in the background.',
            'generated': len(tickets_data)
        }, status=status.HTTP_200_OK)

class RevokeTicketAPIView(APIView):
    def post(self, request):
        if not request.user.is_authenticated:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
            
        ticket_id = request.data.get('ticket_id')
        
        try:
            if ticket_id:
                ticket = ExcursionTicket.objects.get(id=ticket_id)
            else:
                # If no ticket_id provided, assume current student cancelling their own active ticket
                ticket = ExcursionTicket.objects.get(user=request.user, status='active')
                
            # Permission check: Coordinator can revoke any ticket; Students can only cancel their own ticket
            if request.user.role != 'COORDINATOR' and ticket.user_id != request.user.id:
                return Response({'error': 'You do not have permission to cancel this ticket.'}, status=status.HTTP_403_FORBIDDEN)
                
            ticket.status = 'revoked'
            ticket.save()
            return Response({
                'message': 'Ticket RSVP cancelled successfully. The seat is now open for the next candidate on the leaderboard.'
            }, status=status.HTTP_200_OK)
        except ExcursionTicket.DoesNotExist:
            return Response({'error': 'Active ticket not found.'}, status=status.HTTP_404_NOT_FOUND)

class ValidateTicketAPIView(APIView):
    def post(self, request):
        if not request.user.is_authenticated:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
        if request.user.role != 'COORDINATOR' and not getattr(request.user, 'is_executive', False):
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
                
        ticket_uuid = request.data.get('ticket_uuid')
        fallback_pin = request.data.get('fallback_pin')
        
        ticket = None
        if ticket_uuid:
            ticket = ExcursionTicket.objects.filter(ticket_uuid=ticket_uuid).first()
        elif fallback_pin:
            ticket = ExcursionTicket.objects.filter(fallback_pin=fallback_pin).first()
            
        if not ticket:
            return Response({'error': 'Ticket not found.', 'status': 'error'}, status=status.HTTP_404_NOT_FOUND)
            
        if ticket.status == 'revoked':
            return Response({'error': 'This ticket has been revoked.', 'status': 'error'}, status=status.HTTP_400_BAD_REQUEST)
            
        if ticket.is_scanned:
            return Response({'error': 'Already Used', 'status': 'error'}, status=status.HTTP_400_BAD_REQUEST)
            
        ticket.is_scanned = True
        ticket.scanned_at = timezone.now()
        ticket.save()
        
        active_tickets = ExcursionTicket.objects.filter(status='active')
        scanned_count = active_tickets.filter(is_scanned=True).count()
        seats_filled = active_tickets.count()
        
        return Response({
            'message': f'Valid Ticket - Welcome {ticket.user.first_name} {ticket.user.last_name}!',
            'status': 'success',
            'scanned_count': scanned_count,
            'seats_filled': seats_filled,
            'ticket_id': ticket.id,
            'scanned_at': ticket.scanned_at.strftime('%H:%M:%S')
        }, status=status.HTTP_200_OK)

class MyHikingTicketAPIView(APIView):
    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Check if user has an active ticket
        ticket = ExcursionTicket.objects.filter(user=request.user, status='active').first()
        if not ticket:
            # Check if user has a revoked ticket
            revoked_ticket = ExcursionTicket.objects.filter(user=request.user, status='revoked').first()
            if revoked_ticket:
                return Response({
                    'has_ticket': False,
                    'is_revoked': True,
                    'message': 'Your RSVP for the Empowerment Hike was cancelled/revoked. Your seat has been reallocated to the next student on the leaderboard.'
                }, status=status.HTTP_200_OK)
            return Response({
                'has_ticket': False,
                'is_revoked': False,
                'message': 'You do not have an active hiking ticket yet. Tickets are awarded to top volunteers based on logged hours.'
            }, status=status.HTTP_200_OK)
            
        qr_url = ticket.qr_code.url if ticket.qr_code else ""
        hours_display = ticket.locked_hours if ticket.locked_hours > 0 else getattr(ticket.user, 'total_hours', 0.0)
        
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
                'event_title': 'EMPOWERMENT HIKE',
                'event_date': '28 August 2026',
                'event_time': '08:00 - 16:00',
                'location': 'UJ APK Gate 2',
                'attendee_name': f"{ticket.user.first_name} {ticket.user.last_name}".strip() or ticket.user.email,
                'campus': getattr(ticket.user, 'campus', '') or 'UJ Campus',
                'total_hours': hours_display
            }
        }, status=status.HTTP_200_OK)

class ResetTicketsAPIView(APIView):
    def post(self, request):
        if request.user.role != 'COORDINATOR':
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
        
        ticket_count = ExcursionTicket.objects.count()
        snapshot_count = ExcursionLeaderboardSnapshot.objects.count()
        ExcursionTicket.objects.all().delete()
        ExcursionLeaderboardSnapshot.objects.all().delete()
        return Response({
            'message': f'Successfully reset all tickets ({ticket_count} tickets) and unlocked leaderboard snapshot ({snapshot_count} students). You can now start fresh!',
            'deleted_tickets': ticket_count,
            'deleted_snapshots': snapshot_count
        }, status=status.HTTP_200_OK)

def scanner_dashboard_view(request):
    if request.user.is_authenticated:
        if request.user.role == 'COORDINATOR' or getattr(request.user, 'is_executive', False):
            active_tickets = ExcursionTicket.objects.filter(status='active').select_related('user').order_by('created_at')
            has_locked_snapshot = ExcursionLeaderboardSnapshot.objects.exists()
            seats_filled = active_tickets.count()
            scanned_count = active_tickets.filter(is_scanned=True).count()
            pending_count = seats_filled - scanned_count
            context = {
                'active_tickets': active_tickets,
                'seats_filled': seats_filled,
                'scanned_count': scanned_count,
                'pending_count': pending_count,
                'max_seats': 68,
                'has_locked_snapshot': has_locked_snapshot
            }
            return render(request, 'core/scanner_dashboard.html', context)
    return HttpResponseForbidden("You do not have permission to view this page.")

def export_excursion_manifest_pdf(request):
    if not request.user.is_authenticated or request.user.role != 'COORDINATOR':
        return HttpResponseForbidden("Only coordinators can download the official excursion manifest.")
        
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from django.http import HttpResponse
    
    response = HttpResponse(content_type='application/pdf')
    filename = f"CSHAW_Empowerment_Hike_Manifest_{timezone.now().strftime('%Y%m%d')}.pdf"
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
    
    # Custom Palette
    PRIMARY_ORANGE = colors.HexColor('#E35205')
    DARK_NAVY = colors.HexColor('#0f172a')
    SLATE_GREY = colors.HexColor('#475569')
    LIGHT_BG = colors.HexColor('#f8fafc')
    BORDER_COLOR = colors.HexColor('#e2e8f0')
    GREEN_SUCCESS = colors.HexColor('#16a34a')
    RED_REVOKED = colors.HexColor('#dc2626')
    BLUE_REALLOCATED = colors.HexColor('#2563eb')
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=PRIMARY_ORANGE
    )
    
    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
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
        fontSize=13,
        leading=16,
        textColor=DARK_NAVY,
        spaceBefore=14,
        spaceAfter=6
    )

    subsection_heading = ParagraphStyle(
        'SubSectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13,
        textColor=PRIMARY_ORANGE,
        spaceBefore=8,
        spaceAfter=4
    )
    
    cell_style = ParagraphStyle(
        'CellRegular',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=DARK_NAVY
    )

    cell_bold = ParagraphStyle(
        'CellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=DARK_NAVY
    )

    cell_header = ParagraphStyle(
        'CellHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )
    
    badge_active = ParagraphStyle(
        'BadgeActive',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        textColor=GREEN_SUCCESS
    )

    badge_reallocated = ParagraphStyle(
        'BadgeReallocated',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        textColor=BLUE_REALLOCATED
    )

    badge_revoked = ParagraphStyle(
        'BadgeRevoked',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        textColor=RED_REVOKED
    )

    story = []
    
    # 1. Header Banner
    header_table_data = [
        [
            Paragraph("<b>C-SHAW EMPOWERMENT HIKE 2026</b><br/><font size=9 color='#475569'>Official Excursion Roster & Boarding Manifest</font>", title_style),
            Paragraph(f"<b>Issued:</b> {timezone.now().strftime('%d %B %Y')}<br/><b>Event Date:</b> 28 Aug 2026<br/><b>Departure:</b> UJ APK Gate 2", meta_style)
        ]
    ]
    header_table = Table(header_table_data, colWidths=[340, 180])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_ORANGE, spaceBefore=2, spaceAfter=10))
    
    # 2. Gather Data
    all_tickets = ExcursionTicket.objects.select_related('user').order_by('created_at')
    active_tickets = [t for t in all_tickets if t.status == 'active']
    revoked_tickets = [t for t in all_tickets if t.status == 'revoked']
    
    # Determine initial allocation vs reallocated tickets:
    # The first 68 tickets created in chronological order were the initial cohort.
    # Any active ticket with an ID beyond the first 68 (or created after a revocation) is "Newly Allocated / Replaced".
    initial_ticket_ids = set([t.id for t in all_tickets[:68]])
    
    total_active = len(active_tickets)
    total_revoked = len(revoked_tickets)
    total_scanned = len([t for t in active_tickets if t.is_scanned])
    
    # Calculate Overall Gender Split
    total_females = sum(1 for t in active_tickets if getattr(t.user, 'gender', '') == 'Female')
    total_males = sum(1 for t in active_tickets if getattr(t.user, 'gender', '') == 'Male')
    total_other_gender = total_active - total_females - total_males
    
    # Summary Metrics Table
    summary_data = [
        [
            Paragraph("<b>Target Capacity</b><br/><font size=12 color='#0f172a'><b>68 Seats</b></font>", cell_style),
            Paragraph(f"<b>Active Confirmed</b><br/><font size=12 color='#16a34a'><b>{total_active}</b></font>", cell_style),
            Paragraph(f"<b>Total Gender Split</b><br/><font size=11 color='#0f172a'>👩 <b>{total_females}</b> F &nbsp;|&nbsp; 👨 <b>{total_males}</b> M</font>", cell_style),
            Paragraph(f"<b>Cancelled RSVPs</b><br/><font size=12 color='#dc2626'><b>{total_revoked}</b></font>", cell_style),
            Paragraph(f"<b>Checked-In (Scanned)</b><br/><font size=12 color='#2563eb'><b>{total_scanned}</b></font>", cell_style),
        ]
    ]
    summary_table = Table(summary_data, colWidths=[100, 105, 125, 95, 95])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 1, BORDER_COLOR),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('PADDING', (0, 0), (-1, -1), 6),
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
    
    # Organize active tickets
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
        
    # Campus Summary Table
    campus_summary_rows = [
        [
            Paragraph("<b>Campus Location</b>", cell_header),
            Paragraph("<b>Female Volunteers</b>", cell_header),
            Paragraph("<b>Male Volunteers</b>", cell_header),
            Paragraph("<b>Total Attendees</b>", cell_header),
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
                Paragraph(f"<b>{c_tot}</b> Students", cell_bold),
                Paragraph(f"{pct:.1f}%", cell_style),
            ])
            
    c_summary_table = Table(campus_summary_rows, colWidths=[140, 95, 95, 95, 95])
    c_summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), DARK_NAVY),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
    ]))
    story.append(c_summary_table)
    story.append(Spacer(1, 12))

    # --- CAMPUS & GENDER GROUPING (ACTIVE ROSTER) ---
    story.append(Paragraph("<b>PART 1: ACTIVE ATTENDEES (GROUPED BY CAMPUS & GENDER)</b>", section_heading))
    story.append(Paragraph("The following list represents all 68 confirmed students holding active boarding passes, categorized by Campus and Gender.", subtitle_style))
    story.append(Spacer(1, 6))
    
    overall_seq = 1
    for c in campuses_order:
        campus_dict = grouped_active[c]
        c_f = len(campus_dict['Female'])
        c_m = len(campus_dict['Male'])
        campus_total = c_f + c_m + len(campus_dict['Other'])
        if campus_total == 0:
            continue
            
        story.append(Paragraph(f"<b>📍 {campus_names[c]} &nbsp;—&nbsp; Total: {campus_total} Attendees ({c_f} Females, {c_m} Males)</b>", subsection_heading))
        
        table_rows = [
            [
                Paragraph("<b>#</b>", cell_header),
                Paragraph("<b>Student Name</b>", cell_header),
                Paragraph("<b>Email</b>", cell_header),
                Paragraph("<b>Gender</b>", cell_header),
                Paragraph("<b>PIN</b>", cell_header),
                Paragraph("<b>Locked Hours</b>", cell_header),
                Paragraph("<b>Allocation Status</b>", cell_header)
            ]
        ]
        
        # Add Female first then Male then Other
        for gender_key in ['Female', 'Male', 'Other']:
            tickets_list = campus_dict[gender_key]
            for t in tickets_list:
                user = t.user
                is_reallocated = t.id not in initial_ticket_ids
                status_label = Paragraph("<b>Newly Allocated (Replaced)</b>", badge_reallocated) if is_reallocated else Paragraph("<b>Initial Cohort</b>", badge_active)
                
                hours_disp = f"{t.locked_hours:.1f} hrs" if t.locked_hours > 0 else f"{getattr(user, 'total_hours', 0.0):.1f} hrs"
                
                table_rows.append([
                    Paragraph(str(overall_seq), cell_bold),
                    Paragraph(f"<b>{user.first_name} {user.last_name}</b>", cell_style),
                    Paragraph(user.email, cell_style),
                    Paragraph(user.gender or '—', cell_style),
                    Paragraph(f"#{t.fallback_pin}", cell_bold),
                    Paragraph(hours_disp, cell_style),
                    status_label
                ])
                overall_seq += 1
                
        t_table = Table(table_rows, colWidths=[24, 115, 145, 48, 52, 60, 76])
        t_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), DARK_NAVY),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
            ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(t_table)
        story.append(Spacer(1, 10))

    # --- PART 2: CANCELLED / REVOKED TICKETS AUDIT LOG ---
    if revoked_tickets:
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>PART 2: CANCELLED RSVPs & REVOKED TICKETS</b>", section_heading))
        story.append(Paragraph("The following students were originally allocated seats on the leaderboard but cancelled their RSVP or had their tickets revoked. Their seats have been reallocated to the next qualifying volunteers.", subtitle_style))
        story.append(Spacer(1, 6))
        
        revoked_rows = [
            [
                Paragraph("<b>#</b>", cell_header),
                Paragraph("<b>Student Name</b>", cell_header),
                Paragraph("<b>Email</b>", cell_header),
                Paragraph("<b>Campus</b>", cell_header),
                Paragraph("<b>Gender</b>", cell_header),
                Paragraph("<b>Locked Hours</b>", cell_header),
                Paragraph("<b>Status</b>", cell_header)
            ]
        ]
        
        for idx, rt in enumerate(revoked_tickets, 1):
            r_user = rt.user
            r_hours = f"{rt.locked_hours:.1f} hrs" if rt.locked_hours > 0 else f"{getattr(r_user, 'total_hours', 0.0):.1f} hrs"
            revoked_rows.append([
                Paragraph(str(idx), cell_bold),
                Paragraph(f"<b>{r_user.first_name} {r_user.last_name}</b>", cell_style),
                Paragraph(r_user.email, cell_style),
                Paragraph(r_user.campus or '—', cell_style),
                Paragraph(r_user.gender or '—', cell_style),
                Paragraph(r_hours, cell_style),
                Paragraph("<b>Cancelled / Revoked</b>", badge_revoked)
            ])
            
        revoked_table = Table(revoked_rows, colWidths=[24, 115, 155, 60, 50, 60, 56])
        revoked_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#991b1b')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fef2f2')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#fecaca')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(revoked_table)
        story.append(Spacer(1, 14))

    # --- PART 3: SIGN-OFF & COORDINATOR VERIFICATION ---
    story.append(Spacer(1, 10))
    signoff_data = [
        [
            Paragraph("<b>Coordinator Name:</b> ___________________________", meta_style),
            Paragraph("<b>Signature:</b> ___________________________", meta_style),
            Paragraph(f"<b>Date:</b> {timezone.now().strftime('%d/%m/%Y')}", meta_style)
        ]
    ]
    signoff_table = Table(signoff_data, colWidths=[180, 180, 160])
    signoff_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(signoff_table)
    
    doc.build(story)
    return response


