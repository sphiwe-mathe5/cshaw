from django.contrib import admin
from .models import Award, User

@admin.register(Award)
class AwardAdmin(admin.ModelAdmin):
    list_display = ('name', 'icon', 'color')
    search_fields = ('name',)

@admin.register(User)
class CustomUserAdmin(admin.ModelAdmin):
    # 1. WHAT TO SHOW IN THE TABLE (Columns)
    list_display = (
        'email', 
        'first_name', 
        'last_name', 
        'role', 
        'campus', 
        'student_number', 
        'is_executive_display' # Using a custom method for the property
    )

    # 2. ADD A SEARCH BAR (Search by these fields)
    search_fields = ('email', 'first_name', 'last_name', 'student_number')

    # 3. ADD SIDEBAR FILTERS (Filter by these categories)
    list_filter = ('role', 'campus', 'can_manage_attendance', 'is_active')

    # 4. ORGANIZE THE DETAIL VIEW INTO SECTIONS
    fieldsets = (
        ('Personal Info', {
            'fields': ('email', 'first_name', 'last_name', 'student_number')
        }),
        ('Roles & Campus', {
            'fields': ('role', 'campus', 'executive_position', 'can_manage_attendance')
        }),
        ('Bonus Hours & Gamification', {
            'fields': ('manual_bonus_hours', 'recruited_by', 'awards')
        }),
        ('System Preferences', {
            'fields': ('receive_notifications', 'is_active', 'is_staff', 'is_superuser')
        }),
    )

    # 5. UI UPGRADES
    # Makes selecting awards a cool dual-box interface instead of a basic multi-select
    filter_horizontal = ('awards',) 
    
    # Adds a search bar to the 'recruited_by' dropdown so the page doesn't crash if you have 10,000 users
    autocomplete_fields = ('recruited_by',)

    # Helper method to display the @property `is_executive` in the list view
    @admin.display(boolean=True, description='Executive')
    def is_executive_display(self, obj):
        return obj.is_executive