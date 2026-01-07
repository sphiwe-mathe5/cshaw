from django.db import models
from django.conf import settings

class VolunteerActivity(models.Model):
    class Campuses(models.TextChoices):
        APB = 'APB', 'APB Campus'
        DFC = 'DFC', 'DFC Campus'
        APK = 'APK', 'APK Campus'
        SWC = 'SWC', 'SWC Campus'
        ALL = 'ALL', 'All Campuses' # Added 'All' option

    title = models.CharField(max_length=200) # Event Name
    campus = models.CharField(max_length=10, choices=Campuses.choices, default=Campuses.ALL)
    description = models.TextField(help_text="Short summary of the event")
    details = models.TextField(help_text="Full detailed explanation")
    
    total_spots = models.PositiveIntegerField()
    spots_taken = models.PositiveIntegerField(default=0)
    
    date_time = models.DateTimeField()
    duration_hours = models.DecimalField(
        max_digits=4, 
        decimal_places=1, 
        help_text="Duration in hours (e.g. 2.5)",
        null=True, blank=True
    )
    image = models.ImageField(upload_to='activity_images/', blank=True, null=True)
    additional_details = models.TextField(blank=True, null=True, help_text="What to bring, dress code, etc.")
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} ({self.campus})"

    @property
    def spots_left(self):
        return self.total_spots - self.spots_taken
    

class ActivityRole(models.Model):
    class RoleTypes(models.TextChoices):
        SETUP = 'Set Up', 'Set Up - Preparing for the event'
        DEMO = 'Demonstration', 'Demonstration - Showcase safety tips'
        RECRUITMENT = 'Recruitment', 'Recruitment - Convince fellow students to join'
        GENERAL = 'General', 'General Helper'

    activity = models.ForeignKey(VolunteerActivity, related_name='roles', on_delete=models.CASCADE)
    role_type = models.CharField(max_length=50, choices=RoleTypes.choices, default=RoleTypes.GENERAL)
    
    # Removed capacity/spots logic. 
    # This model now simply says: "This event HAS this role available."

    def __str__(self):
        return f"{self.role_type} for {self.activity.title}"
    

class ActivitySignup(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    activity = models.ForeignKey(VolunteerActivity, related_name='signups', on_delete=models.CASCADE)
    selected_role = models.ForeignKey(ActivityRole, on_delete=models.SET_NULL, null=True, blank=True)
    
    signup_at = models.DateTimeField(auto_now_add=True)
    attended = models.BooleanField(default=False) # Coordinator can mark this later

    sign_in_time = models.DateTimeField(null=True, blank=True)
    sign_out_time = models.DateTimeField(null=True, blank=True)
    
    # We store the final calculation here
    hours_earned = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)

    class Meta:
        unique_together = ('user', 'activity') # Prevent double signup for same event

    def __str__(self):
        return f"{self.user.first_name} -> {self.activity.title}"