from django.contrib import admin, messages
from core.models import VolunteerActivity, ActivityRole, ActivitySignup, Feedback, AuditLog, CampTicket

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


@admin.register(CampTicket)
class CampTicketAdmin(admin.ModelAdmin):
    list_display = ('fallback_pin', 'cohort_rank', 'user_email', 'status', 'locked_hours', 'is_scanned', 'tshirt_size', 'created_at')
    list_filter = ('status', 'is_scanned', 'user__campus')
    search_fields = ('fallback_pin', 'user__email', 'user__first_name', 'user__last_name')
    actions = ['reinstate_tickets', 'revoke_tickets']

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = 'Student Email'

    @admin.action(description="Reinstate selected camp tickets (restore to active)")
    def reinstate_tickets(self, request, queryset):
        reinstated = 0
        active_count = CampTicket.objects.filter(status__in=['active', 'confirmed']).count()
        for ticket in queryset.filter(status='revoked'):
            if active_count >= 78:
                self.message_user(request, "Cannot reinstate all selected: 78 camp seats limit reached. Please revoke other tickets first.", level=messages.WARNING)
                break
            ticket.status = 'active'
            student = ticket.user
            if not getattr(student, 'is_camp_eligible', True):
                student.is_camp_eligible = True
                student.save(update_fields=['is_camp_eligible'])
            ticket.save()
            active_count += 1
            reinstated += 1
        if reinstated:
            self.message_user(request, f"Successfully reinstated {reinstated} camp ticket(s).", level=messages.SUCCESS)

    @admin.action(description="Revoke selected camp tickets (cancel RSVP)")
    def revoke_tickets(self, request, queryset):
        revoked = queryset.filter(status__in=['active', 'confirmed']).update(status='revoked')
        self.message_user(request, f"Successfully revoked {revoked} camp ticket(s).", level=messages.SUCCESS)

