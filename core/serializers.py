from rest_framework import serializers, generics
from .models import VolunteerActivity, ActivityRole, ActivitySignup
from users.permissions import IsCoordinator 
from django.utils import timezone


class ActivityRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityRole
        fields = ['id', 'role_type', 'get_role_type_display'] # Display gives the readable text

class VolunteerActivitySerializer(serializers.ModelSerializer):
    roles = ActivityRoleSerializer(many=True, read_only=True) # Read only for display
    
    # We use a simple list of strings for writing (creating) roles
    # e.g., ["Set Up", "Recruitment"]
    role_types = serializers.ListField(
        child=serializers.CharField(), 
        write_only=True, 
        required=False
    )

    class Meta:
        model = VolunteerActivity
        fields = [
            'id', 'title', 'campus', 'description', 'details', 
            'total_spots', 'spots_left', 'date_time', 
            'duration_hours', 'additional_details', 'image',
            'roles', 'role_types'
        ]
        read_only_fields = ['spots_taken']

    def create(self, validated_data):
        role_types = validated_data.pop('role_types', [])
        activity = VolunteerActivity.objects.create(**validated_data)
        
        # Create the Role objects
        for r_type in role_types:
            ActivityRole.objects.create(activity=activity, role_type=r_type)
            
        return activity

    def update(self, instance, validated_data):
        role_types = validated_data.pop('role_types', None)
        instance = super().update(instance, validated_data)
        
        if role_types is not None:
            # Clear old roles and set new ones (Simple Full Replacement)
            instance.roles.all().delete()
            for r_type in role_types:
                ActivityRole.objects.create(activity=instance, role_type=r_type)
        
        return instance
    
class ActivitySignupSerializer(serializers.ModelSerializer):
    # Add read-only fields for the frontend to display nice names
    student_name = serializers.CharField(source='user.first_name', read_only=True)
    student_surname = serializers.CharField(source='user.last_name', read_only=True)
    student_email = serializers.CharField(source='user.email', read_only=True)
    role_name = serializers.CharField(source='selected_role.role_type', read_only=True, default='General')

    class Meta:
        model = ActivitySignup
        fields = [
            'id', 'activity', 'selected_role', 'role_name', 
            'signup_at', 'sign_in_time', 'sign_out_time', 'hours_earned',
            'student_name', 'student_surname', 'student_email'
        ]
        read_only_fields = ['user', 'signup_at', 'hours_earned']

