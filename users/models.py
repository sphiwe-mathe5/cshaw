from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    """
    Custom User Model for Students and Coordinators.
    """
    
    # Define Roles
    class Roles(models.TextChoices):
        STUDENT = 'STUDENT', 'Student'
        COORDINATOR = 'COORDINATOR', 'Coordinator'

    # Define Campuses
    class Campuses(models.TextChoices):
        APB = 'APB', 'APB Campus'
        DFC = 'DFC', 'DFC Campus'
        APK = 'APK', 'APK Campus'
        SWC = 'SWC', 'SWC Campus'

    # Remove default username, use email instead
    username = None
    email = models.EmailField(_('email address'), unique=True)

    # Common Fields
    role = models.CharField(max_length=20, choices=Roles.choices, default=Roles.STUDENT)
    campus = models.CharField(max_length=10, choices=Campuses.choices, null=True, blank=True)
    
    # Student Specific Fields
    student_number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    
    # Executive Team Logic (Chairperson, Treasurer, etc.)
    # Only Coordinators can change this field
    executive_position = models.CharField(max_length=100, null=True, blank=True, help_text="E.g., Chairperson, Secretary. Leave empty if regular volunteer.")
    receive_notifications = models.BooleanField(default=True, help_text="Receive email updates about events")

    # Coordinator specific logic can be handled by the 'role' field, 
    # but if they need specific fields (like department), add them here.

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = [] # Email is handled by USERNAME_FIELD

    # Manager for creating users with email instead of username
    from .managers import CustomUserManager # We need to create this next
    objects = CustomUserManager()

    def __str__(self):
        return f"{self.email} ({self.role})"

    @property
    def is_executive(self):
        return bool(self.executive_position)