from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from . models import Award
from django.db.models import Sum

User = get_user_model()

class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

class StudentRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    recruiter_student_number = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'student_number', 'password', 'campus', 'recruiter_student_number', 'can_manage_attendance']
        extra_kwargs = {'password': {'write_only': True}}

    def validate(self, attrs):
        # 1. Existing Campus Check
        if not attrs.get('campus'):
            raise serializers.ValidationError({"campus": "Students must select a campus."})

        # 2. NEW: Validate Recruiter Existence
        recruiter_number = attrs.get('recruiter_student_number')
        
        if recruiter_number:
            # Check if the recruiter actually exists in the database
            if not User.objects.filter(student_number=recruiter_number).exists():
                raise serializers.ValidationError({
                    "recruiter_student_number": "Recruiter not found. Please check the student number or leave it blank."
                })
            
            # Prevent user from entering their own number (edge case)
            if recruiter_number == attrs.get('student_number'):
                 raise serializers.ValidationError({
                    "recruiter_student_number": "You cannot recruit yourself."
                })

        return attrs

    def create(self, validated_data):
        recruiter_number = validated_data.pop('recruiter_student_number', None)
        
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        
        # 3. Handle Recruitment (Simplified)
        # We don't need try/except here because validate() already guaranteed the user exists
        if recruiter_number:
            recruiter = User.objects.get(student_number=recruiter_number)
            user.recruited_by = recruiter
        
        user.save()
        return user


class AwardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Award
        fields = ['id', 'name', 'icon', 'color']

class StudentListSerializer(serializers.ModelSerializer):
    total_hours = serializers.SerializerMethodField()
    awards = AwardSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'email', 'student_number', 'campus', 'executive_position', 'awards', 'total_hours', 'can_manage_attendance']

    def get_total_hours(self, obj):
        # Calculate sum of hours from attended activities
        # We use 'activitysignup_set' (or whatever your related_name is, likely 'signups' or default)
        # Assuming model is ActivitySignup with 'hours_earned'
        total = obj.activitysignup_set.filter(attended=True).aggregate(sum=Sum('hours_earned'))['sum']
        return float(total or 0.0)

class UserSerializer(serializers.ModelSerializer):
    awards = AwardSerializer(many=True, read_only=True) # Nested serializer
    
    class Meta:
        model = User
        fields = ['id', 'first_name', 'email', 'student_number', 'campus', 'executive_position', 'awards']

class CoordinatorRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    # Secret code to prevent random people from signing up as coordinators
    # In a real app, you might do this via Admin panel invitation, 
    # but for now, let's use a simple code check.
    admin_code = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'campus', 'password', 'admin_code']

    def validate(self, attrs):
        # 1. Check if this Staff Number/Admin Code is already taken
        # We check against 'student_number' because that's where we store unique IDs
        code = attrs.get('admin_code')
        if User.objects.filter(student_number=code).exists():
            raise serializers.ValidationError({"admin_code": "This Staff Number is already registered."})
        
        return attrs

    def create(self, validated_data):
        # Remove admin code before creating user
        validated_data.pop('admin_code', None)
        validated_data['role'] = User.Roles.COORDINATOR
        return User.objects.create_user(**validated_data)
    

class UserProfileSerializer(serializers.ModelSerializer):
    # Field to display readable role name (e.g. "Student" instead of "STUDENT")
    role_label = serializers.CharField(source='get_role_display', read_only=True)
    
    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'email', 
            'student_number', 'campus', 'role', 'role_label',
            'receive_notifications'
        ]
        # These fields cannot be changed by the user
        read_only_fields = ['email', 'role', 'role_label', 'student_number']

class UserManageSerializer(serializers.ModelSerializer):
    # We use PrimaryKeyRelatedField for WRITING (sending IDs like [1, 2])
    awards = serializers.PrimaryKeyRelatedField(
        many=True, 
        queryset=Award.objects.all(),
        required=False
    )

    class Meta:
        model = User
        fields = ['executive_position', 'awards', 'can_manage_attendance'] # Only fields coordinators can change
        
class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)

    def validate_new_password(self, value):
        # Use Django's settings to validate complexity
        validate_password(value)
        return value

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value
    
    
    