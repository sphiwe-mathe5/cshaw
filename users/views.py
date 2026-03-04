from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from decouple import config
from rest_framework import status, generics, permissions, views
import requests
from django.contrib.auth.views import PasswordResetConfirmView, PasswordResetView
from django.urls import reverse_lazy
from rest_framework.views import APIView
from django.shortcuts import render
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
from .services import send_welcome_email
from .models import User, Award
from .permissions import IsCoordinator


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
        user = serializer.save()
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
            print(f"reCAPTCHA Error: {e}")
            return Response({'error': 'Captcha verification failed. Please try again.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- 2. AUTHENTICATE ---
        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            password = serializer.validated_data['password']

            user = authenticate(request, email=email, password=password)

            if user:
                login(request, user)
                return Response({
                    "message": "Login successful",
                    "role": user.role,
                    "campus": user.campus,
                    "is_executive": user.is_executive
                }, status=status.HTTP_200_OK)

            return Response({"error": "Invalid credentials. Please check your email and password."}, status=status.HTTP_401_UNAUTHORIZED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class LogoutView(views.APIView):
    def post(self, request):
        logout(request)
        return Response({"message": "Logged out successfully"}, status=status.HTTP_200_OK)

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
    
    
class CustomPasswordResetView(PasswordResetView):
    template_name = 'users/password_reset.html'
    html_email_template_name = 'users/password_reset_email.html'

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