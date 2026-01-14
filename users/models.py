from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _

class Award(models.Model):
    name = models.CharField(max_length=100) 
    icon = models.CharField(max_length=10, default="🏆") 
    color = models.CharField(max_length=20, default="#FFD700") 

    def __str__(self):
        return self.name
    
class User(AbstractUser):
    """
    Custom User Model for Students and Coordinators.
    """
    
    class Roles(models.TextChoices):
        STUDENT = 'STUDENT', 'Student'
        COORDINATOR = 'COORDINATOR', 'Coordinator'

    class Campuses(models.TextChoices):
        APB = 'APB', 'APB Campus'
        DFC = 'DFC', 'DFC Campus'
        APK = 'APK', 'APK Campus'
        SWC = 'SWC', 'SWC Campus'

    username = None
    email = models.EmailField(_('email address'), unique=True)

    role = models.CharField(max_length=20, choices=Roles.choices, default=Roles.STUDENT)
    campus = models.CharField(max_length=10, choices=Campuses.choices, null=True, blank=True)

    student_number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    
    executive_position = models.CharField(max_length=100, null=True, blank=True, help_text="E.g., Chairperson, Secretary. Leave empty if regular volunteer.")
    receive_notifications = models.BooleanField(default=True, help_text="Receive email updates about events")

    recruited_by = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='recruits'
    )

    awards = models.ManyToManyField(Award, blank=True, related_name='winners')

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = [] 

    from .managers import CustomUserManager 
    objects = CustomUserManager()

    def __str__(self):
        return f"{self.email} ({self.role})"

    @property
    def is_executive(self):
        return bool(self.executive_position)
    
