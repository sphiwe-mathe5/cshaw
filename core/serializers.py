from rest_framework import serializers, generics
from .models import VolunteerActivity, ActivityRole, ActivitySignup
from users.permissions import IsCoordinator 
from django.utils import timezone

class ActivityRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityRole
        fields = ['id', 'role_type', 'get_role_type_display'] 

class VolunteerActivitySerializer(serializers.ModelSerializer):
    roles = ActivityRoleSerializer(many=True, read_only=True) 
    is_signed_up = serializers.SerializerMethodField()
    spots_left = serializers.ReadOnlyField()
    
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
            'roles', 'role_types', 'is_signed_up',
        ]
        read_only_fields = ['spots_taken']

    def create(self, validated_data):
        role_types = validated_data.pop('role_types', [])
        activity = VolunteerActivity.objects.create(**validated_data)
        
        
        for r_type in role_types:
            ActivityRole.objects.create(activity=activity, role_type=r_type)
            
        return activity
    
    def get_is_signed_up(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            
            return obj.signups.filter(user=request.user).exists()
        return False

    def update(self, instance, validated_data):
        role_types = validated_data.pop('role_types', None)
        instance = super().update(instance, validated_data)
        
        if role_types is not None:
            
            instance.roles.all().delete()
            for r_type in role_types:
                ActivityRole.objects.create(activity=instance, role_type=r_type)
        
        return instance
    
class ActivitySignupSerializer(serializers.ModelSerializer):
    
    student_name = serializers.CharField(source='user.first_name', read_only=True)
    student_surname = serializers.CharField(source='user.last_name', read_only=True)
    student_email = serializers.CharField(source='user.email', read_only=True)
    role_name = serializers.CharField(source='selected_role.role_type', read_only=True, default='General')

    class Meta:
        model = ActivitySignup
        fields = [
            'id', 'activity', 'roles', 'role_name', 
            'signup_at', 'sign_in_time', 'sign_out_time', 'hours_earned',
            'student_name', 'student_surname', 'student_email'
        ]
        read_only_fields = ['user', 'signup_at', 'hours_earned']

class ActivitySerializer(serializers.ModelSerializer):
    
    signups = ActivitySignupSerializer(many=True, read_only=True) 
    organizer_name = serializers.ReadOnlyField(source='created_by.first_name')
    date = serializers.SerializerMethodField()
    start_time = serializers.SerializerMethodField()
    slots = serializers.IntegerField(source='total_spots') 
    is_signed_up = serializers.SerializerMethodField()

    class Meta:
        model = VolunteerActivity
        fields = [
            'id', 
            'title', 
            'description', 
            'date_time',    
            'spots_left',   
            'is_signed_up', 
            'date',         
            'start_time',   
            'details',      
            'total_spots',  
            'slots',        
            'created_by',   
            'organizer_name',
            'signups',
            'campus',
            'image'
        ]

    def get_date(self, obj):
        return obj.date_time.date()

    def get_start_time(self, obj):
        return obj.date_time.strftime('%H:%M')
    
    def get_is_signed_up(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            
            return obj.signups.filter(user=request.user).exists()
        return False

class ActivityRSVPSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='user.first_name')
    student_surname = serializers.CharField(source='user.last_name')
    student_email = serializers.CharField(source='user.email')
    role_name = serializers.SerializerMethodField()

    class Meta:
        model = ActivitySignup
        fields = [
            'id', 'student_name', 'student_surname', 'student_email', 
            'role_name', 'sign_in_time', 'sign_out_time', 'hours_earned'
        ]

    def get_role_name(self, obj):
        
        roles = obj.roles.all()
        if roles:
            return ", ".join([r.role_type for r in roles]) 
        return "General"
