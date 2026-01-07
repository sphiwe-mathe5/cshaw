from django.urls import path
from .views import (
    # API Views (Logic)
    StudentRegistrationView, 
    CoordinatorRegistrationView, 
    LoginView, 
    LogoutView,
    AssignExecutiveView,
    StudentListView,
    
    # HTML Page Views (Templates)
    login_page,
    student_register_page,
    coordinator_register_page
)

urlpatterns = [
    # --- 1. API Endpoints (These talk to your auth.js) ---
    # We explicitly add 'api/users/' here because your main urls.py includes this file at root ''
    
    path('api/users/register/student/', StudentRegistrationView.as_view(), name='api-register-student'),
    path('api/users/register/coordinator/', CoordinatorRegistrationView.as_view(), name='api-register-coordinator'),
    path('api/users/login/', LoginView.as_view(), name='api-login'),
    path('api/users/logout/', LogoutView.as_view(), name='api-logout'),
    path('api/users/assign-executive/', AssignExecutiveView.as_view(), name='api-assign-executive'),
    path('api/users/students/', StudentListView.as_view(), name='student-list'), # New Endpoint

    # --- 2. HTML Pages (These show the forms) ---
    path('login/', login_page, name='login-page'),
    path('register/student/', student_register_page, name='student-register-page'),
    path('register/coordinator/', coordinator_register_page, name='coordinator-register-page'),
]