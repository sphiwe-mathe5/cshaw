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
from .models import ExcursionTicket
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
            
        MAX_SEATS = 65
        
        # Get active tickets
        active_tickets = ExcursionTicket.objects.filter(status='active')
        active_ticket_count = active_tickets.count()
        seats_to_fill = MAX_SEATS - active_ticket_count
        
        if seats_to_fill <= 0:
            return Response({'message': 'All seats are already filled.', 'generated': 0}, status=status.HTTP_200_OK)
            
        # Get all students, sort by total_hours descending
        students = list(User.objects.filter(role='STUDENT', is_active=True))
        students.sort(key=lambda u: u.total_hours, reverse=True)
        
        existing_tickets = ExcursionTicket.objects.all()
        users_with_tickets = {t.user_id: t for t in existing_tickets}
        
        eligible_students = []
        for s in students:
            ticket = users_with_tickets.get(s.id)
            if not ticket:
                eligible_students.append(s)
            elif ticket.status == 'revoked':
                continue
            elif ticket.status == 'active':
                continue
                
        # Take the top `seats_to_fill` students
        selected_students = eligible_students[:seats_to_fill]
        
        if not selected_students:
            return Response({'message': 'No eligible students found.', 'generated': 0}, status=status.HTTP_200_OK)
            
        tickets_data = []
        for student in selected_students:
            # Generate 6-digit PIN
            pin = ''.join(random.choices('0123456789', k=6))
            # Ensure unique PIN
            while ExcursionTicket.objects.filter(fallback_pin=pin).exists():
                pin = ''.join(random.choices('0123456789', k=6))
                
            ticket = ExcursionTicket.objects.create(
                user=student,
                fallback_pin=pin,
                status='active'
            )
            tickets_data.append({'user': student, 'ticket': ticket})
            
        # Spawn thread to generate QR and send emails
        thread = threading.Thread(target=generate_and_email_tickets, args=(tickets_data,))
        thread.start()
        
        return Response({
            'message': f'Successfully generated {len(tickets_data)} tickets. Emails are sending in the background.',
            'generated': len(tickets_data)
        }, status=status.HTTP_200_OK)

class RevokeTicketAPIView(APIView):
    def post(self, request):
        if request.user.role != 'COORDINATOR':
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
        ticket_id = request.data.get('ticket_id')
        try:
            ticket = ExcursionTicket.objects.get(id=ticket_id)
            ticket.status = 'revoked'
            ticket.save()
            return Response({'message': 'Ticket revoked successfully.'}, status=status.HTTP_200_OK)
        except ExcursionTicket.DoesNotExist:
            return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)

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

def scanner_dashboard_view(request):
    if request.user.is_authenticated:
        if request.user.role == 'COORDINATOR' or getattr(request.user, 'is_executive', False):
            active_tickets = ExcursionTicket.objects.filter(status='active').select_related('user').order_by('created_at')
            context = {
                'active_tickets': active_tickets,
                'seats_filled': active_tickets.count(),
                'max_seats': 65
            }
            return render(request, 'core/scanner_dashboard.html', context)
    return HttpResponseForbidden("You do not have permission to view this page.")
