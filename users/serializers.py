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
    recruiter_email = serializers.EmailField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'password', 'campus', 'recruiter_email', 'can_manage_attendance']
        extra_kwargs = {'password': {'write_only': True}}

    def validate(self, attrs):
        # 1. Existing Campus Check
        if not attrs.get('campus'):
            raise serializers.ValidationError({"campus": "Students must select a campus."})

        # 2. Validate Recruiter Existence by Email
        recruiter_email = attrs.get('recruiter_email')
        
        if recruiter_email:
            # Check if the recruiter actually exists in the database
            if not User.objects.filter(email__iexact=recruiter_email).exists():
                raise serializers.ValidationError({
                    "recruiter_email": "Recruiter not found. Please check the email or leave it blank."
                })
            
            # Prevent user from entering their own email
            if recruiter_email.lower() == (attrs.get('email') or '').lower():
                 raise serializers.ValidationError({
                    "recruiter_email": "You cannot recruit yourself."
                })

        return attrs

    def create(self, validated_data):
        recruiter_email = validated_data.pop('recruiter_email', None)
        
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        
        # 3. Handle Recruitment
        if recruiter_email:
            recruiter = User.objects.filter(email__iexact=recruiter_email).first()
            if recruiter:
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
        fields = [
            'id', 'first_name', 'last_name', 'email', 'id_type', 'id_number',
            'campus', 'executive_position', 'awards', 'total_hours', 
            'can_manage_attendance', 'gender', 'tshirt_size', 'volunteer_status',
            'popia_consent'
        ]

    def get_total_hours(self, obj):
        # 1. Get the sum of all attended events
        activity_total = obj.activitysignup_set.filter(attended=True).aggregate(sum=Sum('hours_earned'))['sum']
        
        # 2. Convert to float (default to 0.0 if None)
        calculated_hours = float(activity_total or 0.0)
        
        # 3. Add the manual bonus hours from the Admin panel
        bonus_hours = float(obj.manual_bonus_hours or 0.0)
        
        return calculated_hours + bonus_hours

class UserSerializer(serializers.ModelSerializer):
    awards = AwardSerializer(many=True, read_only=True) # Nested serializer
    
    class Meta:
        model = User
        fields = ['id', 'first_name', 'email', 'id_type', 'id_number', 'campus', 'executive_position', 'awards', 'popia_consent']

class CoordinatorRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    admin_code = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'campus', 'password', 'admin_code']

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
            'first_name', 'last_name', 'email', 'id_type', 'id_number',
            'campus', 'role', 'role_label',
            'receive_notifications', 'is_2fa_enabled', 'popia_consent'
        ]
        # These fields cannot be changed by the user
        read_only_fields = ['email', 'role', 'role_label', 'is_2fa_enabled', 'popia_consent']

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
    
    
    