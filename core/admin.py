from django.contrib import admin

from core.models import VolunteerActivity, ActivityRole, ActivitySignup

admin.site.register(VolunteerActivity)
admin.site.register(ActivityRole)
admin.site.register(ActivitySignup)
