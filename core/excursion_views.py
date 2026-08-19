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
        
        context = {
            'first_name': user.first_name,
            'pin': ticket.fallback_pin,
            'qr_url': qr_url
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
        
        return Response({
            'message': f'Valid Ticket - Welcome {ticket.user.first_name}!',
            'status': 'success'
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
            context = {
                'active_tickets': active_tickets,
                'seats_filled': active_tickets.count(),
                'max_seats': 68,
                'has_locked_snapshot': has_locked_snapshot
            }
            return render(request, 'core/scanner_dashboard.html', context)
    return HttpResponseForbidden("You do not have permission to view this page.")

