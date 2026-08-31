from django.contrib import admin
from core.models import VolunteerActivity, ActivityRole, ActivitySignup, Feedback, AuditLog

from django import forms
from django.contrib.admin import widgets
from django.utils import timezone
from datetime import timedelta

class VolunteerActivityAdminForm(forms.ModelForm):
    start_time = forms.SplitDateTimeField(
        widget=widgets.AdminSplitDateTime(),
        required=True,
        help_text="Start date and time of the event"
    )
    end_time = forms.SplitDateTimeField(
        widget=widgets.AdminSplitDateTime(),
        required=True,
        help_text="End date and time of the event"
    )

    class Meta:
        model = VolunteerActivity
        fields = '__all__'
        exclude = ('date_time',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields['start_time'].initial = self.instance.date_time
            if self.instance.duration_hours:
                hours = float(self.instance.duration_hours)
                self.fields['end_time'].initial = self.instance.date_time + timedelta(hours=hours)

    def save(self, commit=True):
        instance = super().save(commit=False)
        start = self.cleaned_data.get('start_time')
        end = self.cleaned_data.get('end_time')
        
        if start:
            instance.date_time = start
        if start and end:
            delta = end - start
            hours = delta.total_seconds() / 3600.0
            instance.duration_hours = round(hours, 2)
            
        if commit:
            instance.save()
            self.save_m2m()
        return instance

@admin.register(VolunteerActivity)
class VolunteerActivityAdmin(admin.ModelAdmin):
    form = VolunteerActivityAdminForm
    list_display = ('title', 'campus', 'get_start_time', 'get_end_time')
    readonly_fields = ('duration_hours',)
    
    def get_start_time(self, obj):
        return obj.date_time
    get_start_time.short_description = 'Start Time'
    
    def get_end_time(self, obj):
        if obj.date_time and obj.duration_hours:
            return obj.date_time + timedelta(hours=float(obj.duration_hours))
        return None
    get_end_time.short_description = 'End Time'

admin.site.register(ActivitySignup)
admin.site.register(Feedback)

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'action', 'actor', 'target_type', 'target_id')
    list_filter = ('action', 'target_type', 'created_at')
    search_fields = ('action', 'actor__email', 'target_type', 'target_id')
    readonly_fields = ('actor', 'action', 'target_type', 'target_id', 'metadata', 'created_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

