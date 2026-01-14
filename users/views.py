from django.contrib.auth import authenticate, login, logout
from rest_framework import status, generics, permissions, views
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



class StudentRegistrationView(generics.CreateAPIView):
    serializer_class = StudentRegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        user = serializer.save()
        send_welcome_email(user, "Student Volunteer")

class CoordinatorRegistrationView(generics.CreateAPIView):
    serializer_class = CoordinatorRegistrationSerializer
    permission_classes = [permissions.AllowAny]

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
            
            return Response({"error": "Invalid Credentials"}, status=status.HTTP_401_UNAUTHORIZED)
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

        try:
            student = User.objects.get(id=student_id, role=User.Roles.STUDENT)
            student.executive_position = position
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
    
class UserDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        user = request.user
        user.delete()
        return Response({"message": "Account deleted successfully"}, status=status.HTTP_204_NO_CONTENT)

def login_page(request):
    return render(request, 'users/login.html')

def student_register_page(request):
    return render(request, 'users/student_register.html')

def coordinator_register_page(request):
    return render(request, 'users/coordinator_register.html')