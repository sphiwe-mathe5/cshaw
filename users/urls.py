from django.urls import path
from django.contrib.auth import views as auth_views
from .views import (
    CustomPasswordResetView,
    CustomPasswordResetConfirmView,
    StudentRegistrationView, 
    CoordinatorRegistrationView, 
    LoginView, 
    LogoutView,
    AssignExecutiveView,
    StudentListView,
    Toggle2FAView,
    UserProfileView,
    UserDeleteView, 
    ChangePasswordView,   
    AwardListView,
    StudentUpdateView,
    VerifyOTPView,
    UpdateVolunteerStatusView,
    
    login_page,
    student_register_page,
    coordinator_register_page
)
from users import views

from core import views 

urlpatterns = [

    path('api/users/update-volunteer-status/', UpdateVolunteerStatusView.as_view(), name='api-update-volunteer-status'),
    path('api/users/register/student/', StudentRegistrationView.as_view(), name='api-register-student'),
    path('api/users/register/coordinator/', CoordinatorRegistrationView.as_view(), name='api-register-coordinator'),
    path('api/users/login/', LoginView.as_view(), name='api-login'),
    path('api/users/logout/', LogoutView.as_view(), name='api-logout'),
    path('api/users/assign-executive/', AssignExecutiveView.as_view(), name='api-assign-executive'),
    path('api/users/students/', StudentListView.as_view(), name='student-list'), # New Endpoint
    path('api/users/profile/', UserProfileView.as_view(), name='user-profile'),
    path('api/users/change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('api/users/delete/', UserDeleteView.as_view(), name='user-delete'),
    path('api/awards/', AwardListView.as_view(), name='award-list'),
    path('api/users/students/<int:pk>/update/', StudentUpdateView.as_view(), name='student-update'),
    

     path('password-reset/', 
          CustomPasswordResetView.as_view(), 
          name='password_reset'),
         
    path('password-reset/done/', 
         auth_views.PasswordResetDoneView.as_view(template_name='users/password_reset_done.html'), 
         name='password_reset_done'),
         
     path('password-reset-confirm/<uidb64>/<token>/', 
          CustomPasswordResetConfirmView.as_view(), 
          name='password_reset_confirm'),
         
    path('password-reset-complete/', 
         auth_views.PasswordResetCompleteView.as_view(template_name='users/password_reset_complete.html'), 
         name='password_reset_complete'),

    path('login/', login_page, name='login-page'),
    path('register/student/', student_register_page, name='student-register-page'),
    path('api/auth/verify-otp/', VerifyOTPView.as_view(), name='verify_otp'),
    path('api/users/toggle-2fa/', Toggle2FAView.as_view(), name='toggle_2fa'),
    
    #path('login/', views.index_page, name='login-page'),
    #path('register/student/', views.index_page, name='student-register-page'),
    
    
    #path('register/coordinator/', coordinator_register_page, name='coordinator-register-page'),
    
]