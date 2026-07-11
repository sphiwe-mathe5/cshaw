from django.db import models
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _

class Award(models.Model):
    name = models.CharField(max_length=100) 
    icon = models.CharField(max_length=10, default="🏆") 
    color = models.CharField(max_length=20, default="#FFD700") 
    description = models.TextField(blank=True, default="")
    date_awarded = models.CharField(max_length=50, blank=True, default="")

    def __str__(self):
        return self.name
    
class User(AbstractUser):
    is_2fa_enabled = models.BooleanField(default=False)
    otp_code = models.CharField(max_length=6, blank=True, null=True)
    otp_created_at = models.DateTimeField(blank=True, null=True)
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
    
    manual_bonus_hours = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        default=0.00,
        help_text="Admins can use this to manually add or subtract hours from the student's total."
    )
    points = models.PositiveIntegerField(default=0, help_text="Gamified learning points earned from LMS quizzes")

    role = models.CharField(max_length=20, choices=Roles.choices, default=Roles.STUDENT)
    campus = models.CharField(max_length=10, choices=Campuses.choices, null=True, blank=True)

    student_number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    
    executive_position = models.CharField(max_length=100, null=True, blank=True, help_text="E.g., Chairperson, Secretary. Leave empty if regular volunteer.")
    receive_notifications = models.BooleanField(default=True, help_text="Receive email updates about events")
    
    can_manage_attendance = models.BooleanField(
        default=False, 
        help_text="Designates whether this executive can scan/manage student attendance."
    )

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
    
    @property
    def total_hours(self):
        from django.db.models import Sum
        activity_total = self.activitysignup_set.filter(attended=True).aggregate(sum=Sum('hours_earned'))['sum']
        calculated_hours = float(activity_total or 0.0)
        bonus_hours = float(self.manual_bonus_hours or 0.0)
        return calculated_hours + bonus_hours
    

class VolunteerBadge(models.Model):
    BADGE_CHOICES = [
        ('40_hours', '40 Hours Milestone'),
        ('80_hours', '80 Hours Milestone'),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='badges')
    badge_type = models.CharField(max_length=20, choices=BADGE_CHOICES)
    date_earned = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'badge_type')

    def __str__(self):
        return f"{self.user.email} - {self.get_badge_type_display()}"
