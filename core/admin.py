from django.contrib import admin

from core.models import VolunteerActivity, ActivityRole, ActivitySignup, Feedback

admin.site.register(VolunteerActivity)
admin.site.register(ActivityRole)
admin.site.register(ActivitySignup)
admin.site.register(Feedback)
