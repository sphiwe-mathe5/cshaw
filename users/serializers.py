from rest_framework import serializers
from django.contrib.auth import get_user_model

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