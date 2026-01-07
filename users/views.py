from django.contrib.auth import authenticate, login, logout
from rest_framework import status, generics, permissions, views
from django.shortcuts import render
from rest_framework.response import Response
from .serializers import (
    StudentRegistrationSerializer, 
    CoordinatorRegistrationSerializer, 
    UserLoginSerializer,
    StudentListSerializer
)
from .models import User
from .permissions import IsCoordinator

# --- 1. Registration Views ---

class StudentRegistrationView(generics.CreateAPIView):
    serializer_class = StudentRegistrationSerializer
    permission_classes = [permissions.AllowAny]

class CoordinatorRegistrationView(generics.CreateAPIView):
    serializer_class = CoordinatorRegistrationSerializer
    permission_classes = [permissions.AllowAny]

# --- 2. Login View ---

class LoginView(views.APIView):
    permission_classes = [permissions.AllowAny]
    
    def post(self, request):
        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            password = serializer.validated_data['password']
            
            # Authenticate using Email
            user = authenticate(request, email=email, password=password)
            
            if user:
                login(request, user) # Creates the session for the browser
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

# --- 3. Coordinator Management Views ---

class AssignExecutiveView(views.APIView):
    """
    Allows a Coordinator to assign an executive role (e.g., 'Chairperson') to a student.
    Payload: {"student_id": 1, "position": "Chairperson"}
    """
    permission_classes = [IsCoordinator] # Strict permission

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



class StudentListView(generics.ListAPIView):
    serializer_class = StudentListSerializer
    permission_classes = [IsCoordinator]

    def get_queryset(self):
        # Return only students, ordered by Campus then Name
        return User.objects.filter(role=User.Roles.STUDENT).order_by('campus', 'first_name')
    

# --- 4. Simple Page Render Views (if needed) ---
def login_page(request):
    return render(request, 'users/login.html')

def student_register_page(request):
    return render(request, 'users/student_register.html')

def coordinator_register_page(request):
    return render(request, 'users/coordinator_register.html')