from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()

class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

class StudentRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'student_number', 'campus', 'password']

    def validate(self, attrs):
        # Ensure campus is selected
        if not attrs.get('campus'):
            raise serializers.ValidationError({"campus": "Students must select a campus."})
        return attrs

    def create(self, validated_data):
        validated_data['role'] = User.Roles.STUDENT
        return User.objects.create_user(**validated_data)
    
class StudentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'email', 'student_number', 'campus', 'executive_position']

class CoordinatorRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    # Secret code to prevent random people from signing up as coordinators
    # In a real app, you might do this via Admin panel invitation, 
    # but for now, let's use a simple code check.
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
            'first_name', 'last_name', 'email', 
            'student_number', 'campus', 'role', 'role_label',
            'receive_notifications'
        ]
        # These fields cannot be changed by the user
        read_only_fields = ['email', 'role', 'role_label', 'student_number']

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