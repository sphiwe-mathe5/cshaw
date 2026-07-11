from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from decouple import config
from rest_framework import status, generics, permissions, views
import requests
from django.contrib.auth.views import PasswordResetConfirmView, PasswordResetView
from django.contrib.auth.forms import PasswordResetForm
from django.template.loader import render_to_string
from django.urls import reverse_lazy
from rest_framework.views import APIView
from django.shortcuts import redirect, render
from rest_framework.response import Response
from .serializers import (
    StudentRegistrationSerializer, 
    CoordinatorRegistrationSerializer, 
    UserLoginSerializer,
    StudentListSerializer,
    UserProfileSerializer,
    ChangePasswordSerializer,
    AwardSerializer,
    UserManageSerializer
)
from django.db import transaction
from .services import BackgroundEmailService, send_welcome_email
from .models import User, Award
from .permissions import IsCoordinator
from django.utils import timezone
from datetime import timedelta
import random
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings


def verify_recaptcha(recaptcha_token):
    """Verify reCAPTCHA token with Google's API."""
    if not recaptcha_token:
        return False
    
    secret_key = config('RECAPTCHA_SECRET_KEY')
    verify_url = 'https://www.google.com/recaptcha/api/siteverify'
    
    try:
        response = requests.post(verify_url, data={
            'secret': secret_key,
            'response': recaptcha_token
        })
        result = response.json()
        
        # Check success AND score (0.0 = Bot, 1.0 = Human)
        # A score of < 0.5 is usually considered suspicious
        return result.get('success') and result.get('score', 0) >= 0.5
    except Exception as e:
        print(f"reCAPTCHA Error: {e}")
        return False

def send_postmark_otp(recipient_email, otp_code, first_name="Volunteer"):
    subject = "C-SHAW Hub: Your Login Verification Code"
    
    # Load the HTML template and pass the variables
    html_content = render_to_string('users/otp_email.html', {
        'otp_code': otp_code,
        'first_name': first_name
    })
    
    # Create a plain-text fallback automatically
    text_content = strip_tags(html_content)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=settings.DEFAULT_FROM_EMAIL, # Uses 'info@cshaw.co.za' from settings
        to=[recipient_email]
    )
    
    # Attach the HTML version
    msg.attach_alternative(html_content, "text/html")
    
    # Tell Anymail to use the transactional stream
    msg.message_stream = "outbound" 
    
    try:
        msg.send()
    except Exception as e:
        print(f"Failed to send OTP via Anymail: {e}")
        
        
class StudentRegistrationView(generics.CreateAPIView):
    serializer_class = StudentRegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        # --- 1. VERIFY RECAPTCHA v3 ---
        recaptcha_token = request.data.get('g-recaptcha-response')
        
        if not recaptcha_token:
            return Response({'error': 'Missing reCAPTCHA token.'}, status=status.HTTP_400_BAD_REQUEST)

        secret_key = config('RECAPTCHA_SECRET_KEY')
        verify_url = 'https://www.google.com/recaptcha/api/siteverify'
        
        try:
            # Send token to Google
            response = requests.post(verify_url, data={
                'secret': secret_key,
                'response': recaptcha_token
            })
            result = response.json()
            
            # Check success AND score (0.0 = Bot, 1.0 = Human)
            # A score of < 0.5 is usually considered suspicious
            if not result.get('success') or result.get('score', 0) < 0.5:
                return Response({'error': 'Spam detected. Registration blocked.'}, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            # Log the error internally, but give a generic error to user
            print(f"Recaptcha Error: {e}") 
            return Response({'error': 'Captcha verification failed. Please try again.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- 2. PROCEED WITH REGISTRATION ---
        # If we reach here, the user is a human.
        # We call the standard create method which handles the serializer validation & saving
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        # transaction.atomic() ensures that if anything in this block crashes, 
        # the database instantly deletes the partial user and rolls back.
        with transaction.atomic():
            user = serializer.save()
            
        # The email is outside the transaction so it fires AFTER the user is safely saved
        send_welcome_email(user, "Student Volunteer")

class CoordinatorRegistrationView(generics.CreateAPIView):
    serializer_class = CoordinatorRegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        # --- 1. VERIFY RECAPTCHA ---
        recaptcha_token = request.data.get('g-recaptcha-response')

        if not recaptcha_token:
            return Response({'error': 'Missing reCAPTCHA token.'}, status=status.HTTP_400_BAD_REQUEST)

        secret_key = config('RECAPTCHA_SECRET_KEY')
        try:
            result = requests.post('https://www.google.com/recaptcha/api/siteverify', data={
                'secret': secret_key,
                'response': recaptcha_token
            }).json()

            if not result.get('success') or result.get('score', 0) < 0.5:
                return Response({'error': 'Spam detected. Registration blocked.'}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            print(f"reCAPTCHA Error: {e}")
            return Response({'error': 'Captcha verification failed. Please try again.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- 2. PROCEED WITH REGISTRATION ---
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = serializer.save()
        send_welcome_email(user, "Coordinator")

class AwardListView(generics.ListAPIView):
    queryset = Award.objects.all()
    serializer_class = AwardSerializer
    permission_classes = [permissions.IsAuthenticated]


class LoginView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # --- 1. VERIFY RECAPTCHA ---
        recaptcha_token = request.data.get('g-recaptcha-response')
        if not recaptcha_token:
            return Response({'error': 'Missing reCAPTCHA token.'}, status=status.HTTP_400_BAD_REQUEST)

        secret_key = config('RECAPTCHA_SECRET_KEY')
        try:
            result = requests.post('https://www.google.com/recaptcha/api/siteverify', data={
                'secret': secret_key,
                'response': recaptcha_token
            }).json()

            if not result.get('success') or result.get('score', 0) < 0.5:
                return Response({'error': 'Spam detected. Please try again.'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': 'Captcha verification failed. Please try again.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- 2. AUTHENTICATE ---
        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            password = serializer.validated_data['password']

            user = authenticate(request, email=email, password=password)

            if user:
                # --- 3. CHECK FOR 2FA ---
                if user.is_2fa_enabled:
                    # Generate a 6-digit code
                    otp = str(random.randint(100000, 999999))
                    user.otp_code = otp
                    user.otp_created_at = timezone.now()
                    user.save()

                    # Save their ID temporarily in the session so we know who is trying to verify
                    request.session['pre_2fa_user_id'] = user.id
                    
                    # Send the email via Postmark
                    send_postmark_otp(user.email, otp)

                    return Response({
                        "requires_2fa": True, 
                        "message": "OTP sent to your email."
                    }, status=status.HTTP_200_OK)

                # If 2FA is off, log them in normally
                login(request, user)
                return Response({
                    "message": "Login successful",
                    "role": user.role,
                    "campus": user.campus,
                    "is_executive": user.is_executive
                }, status=status.HTTP_200_OK)

            return Response({"error": "Invalid credentials. Please check your email and password."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class VerifyOTPView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        otp_entered = request.data.get('otp')
        user_id = request.session.get('pre_2fa_user_id')

        if not user_id or not otp_entered:
            return Response({"error": "Session expired. Please log in again."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(id=user_id).first()
        if not user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check if OTP has expired (10-minute limit)
        expiration_time = user.otp_created_at + timedelta(minutes=10)
        if timezone.now() > expiration_time:
            return Response({"error": "OTP has expired. Please log in again to receive a new code."}, status=status.HTTP_400_BAD_REQUEST)

        # Verify the code
        if user.otp_code == otp_entered:
            # Clear the OTP data for security
            user.otp_code = None
            user.save()
            
            # Formally log the user in
            login(request, user)
            del request.session['pre_2fa_user_id'] # Clear the temporary session var
            
            return Response({
                "message": "Login successful",
                "role": user.role,
                "campus": user.campus,
                "is_executive": user.is_executive
            }, status=status.HTTP_200_OK)

        return Response({"error": "Invalid verification code."}, status=status.HTTP_401_UNAUTHORIZED)
    
class LogoutView(views.APIView):
    def post(self, request):
        logout(request)
        # Instead of returning JSON, redirect the browser straight to login!
        return redirect('/login/')

class AssignExecutiveView(views.APIView):
    permission_classes = [IsCoordinator]

    def post(self, request):
        student_id = request.data.get('student_id')
        position = request.data.get('position')
        
        # 1. Capture the checkbox value
        can_manage = request.data.get('can_manage_attendance')

        try:
            student = User.objects.get(id=student_id, role=User.Roles.STUDENT)
            
            # 2. Update fields
            student.executive_position = position
            
            # 3. Handle the Boolean (Check if it was sent)
            if can_manage is not None:
                student.can_manage_attendance = bool(can_manage)

            student.save()
            return Response({"message": f"Student assigned as {position}"})
            
        except User.DoesNotExist:
            return Response({"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND)
        
class StudentUpdateView(generics.UpdateAPIView):
    queryset = User.objects.all()
    serializer_class = UserManageSerializer
    permission_classes = [permissions.IsAuthenticated]


class StudentListView(generics.ListAPIView):
    serializer_class = StudentListSerializer
    permission_classes = [IsCoordinator]

    def get_queryset(self):
        return User.objects.filter(role=User.Roles.STUDENT).order_by('campus', 'first_name')
    

class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        
        if serializer.is_valid():
            user = request.user
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            return Response({"message": "Password updated successfully."}, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class AsyncPasswordResetForm(PasswordResetForm):
    def send_mail(self, subject_template_name, email_template_name, context, from_email, to_email, html_email_template_name=None):
        """
        Overrides Django's default synchronous email send to use our background thread.
        """
        # 1. Render the subject and remove any accidental newlines
        subject = render_to_string(subject_template_name, context)
        subject = "".join(subject.splitlines())

        # 2. Render the HTML body (Fallback to plain text if HTML template is missing)
        if html_email_template_name:
            html_content = render_to_string(html_email_template_name, context)
        else:
            # Wrap plain text in simple tags so our service can strip it normally
            plain_text = render_to_string(email_template_name, context)
            html_content = f"<p>{plain_text}</p>"

        # 3. Fire and forget!
        BackgroundEmailService._send_async(
            subject=subject,
            to_emails=[to_email],
            html_content=html_content
        )  
    
class CustomPasswordResetView(PasswordResetView):
    template_name = 'users/password_reset.html'
    html_email_template_name = 'users/password_reset_email.html'
    
    # 👇 ADD THIS LINE 👇
    form_class = AsyncPasswordResetForm

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['RECAPTCHA_SITE_KEY'] = config('RECAPTCHA_SITE_KEY')
        return context

    def form_valid(self, form):
        email = form.cleaned_data.get('email')

        # --- 1. RECAPTCHA CHECK ---
        recaptcha_token = self.request.POST.get('g-recaptcha-response')
        if not verify_recaptcha(recaptcha_token):
            messages.error(self.request, 'Spam detected. Please try again.')
            return self.form_invalid(form)

        # --- 2. EMAIL EXISTS CHECK ---
        if not User.objects.filter(email=email).exists():
            messages.error(self.request, 'No account found with that email address.')
            return self.form_invalid(form)

        return super().form_valid(form)
    
class CustomPasswordResetConfirmView(PasswordResetConfirmView):
    template_name = 'users/password_reset_confirm.html'
    success_url = reverse_lazy('login-page') 
        
class UserDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        user = request.user
        user.delete()
        return Response({"message": "Account deleted successfully"}, status=status.HTTP_204_NO_CONTENT)

class Toggle2FAView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        
        # Toggle the boolean state
        user.is_2fa_enabled = not user.is_2fa_enabled
        user.save()
        
        status_msg = "enabled" if user.is_2fa_enabled else "disabled"
        return Response({
            "message": f"Two-Factor Authentication is now {status_msg}.",
            "is_2fa_enabled": user.is_2fa_enabled
        }, status=status.HTTP_200_OK)
        
        
def login_page(request):
    context = {
        'RECAPTCHA_SITE_KEY': config('RECAPTCHA_SITE_KEY')
    }
    return render(request, 'users/login.html', context)

def student_register_page(request):
    context = {
        'RECAPTCHA_SITE_KEY': config('RECAPTCHA_SITE_KEY')
    }
    return render(request, 'users/student_register.html', context)

def coordinator_register_page(request):
    context = {
        'RECAPTCHA_SITE_KEY': config('RECAPTCHA_SITE_KEY')
    }
    return render(request, 'users/coordinator_register.html', context)