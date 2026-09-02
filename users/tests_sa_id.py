from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from core.models import AuditLog
from users.views import validate_south_african_id

User = get_user_model()

class SouthAfricanIDCollectionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            email='id_student@test.com',
            password='TestPassword123!',
            first_name='Lerato',
            last_name='Khumalo',
            role=User.Roles.STUDENT,
            campus='APK'
        )
        self.client.force_authenticate(user=self.student)
        # Valid test ID: 0001015000084 (DOB: 2000-01-01, Male, SA Citizen, valid Luhn checksum 4)
        self.valid_id = '0001015000084'

    def test_validate_south_african_id_helper(self):
        "Test valid and invalid ID formats with the helper function."
        # Valid ID
        is_valid, res = validate_south_african_id(self.valid_id)
        self.assertTrue(is_valid)
        self.assertEqual(res, self.valid_id)

        # Valid formatted ID with spaces
        is_valid, res = validate_south_african_id('000101 5000 08 4')
        self.assertTrue(is_valid)
        self.assertEqual(res, self.valid_id)

        # Invalid length (too short)
        is_valid, err = validate_south_african_id('000101500008')
        self.assertFalse(is_valid)
        self.assertIn("13 numeric digits", err)

        # Invalid characters
        is_valid, err = validate_south_african_id('000101500008A')
        self.assertFalse(is_valid)

        # Invalid month (month 13)
        is_valid, err = validate_south_african_id('0013015000084')
        self.assertFalse(is_valid)
        self.assertIn("Invalid date of birth", err)

        # Invalid Luhn checksum (changed last digit from 4 to 5)
        is_valid, err = validate_south_african_id('0001015000085')
        self.assertFalse(is_valid)
        self.assertIn("checksum", err.lower())

    def test_update_id_number_success(self):
        """Ensure a valid ID number with POPIA consent updates the student profile and records an audit log."""
        response = self.client.post('/api/users/update-id-number/', {
            'id_number': '000101 5000 08 4',
            'popia_consent': True
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('success'))

        self.student.refresh_from_db()
        self.assertEqual(self.student.id_number, self.valid_id)
        self.assertTrue(self.student.popia_consent)
        self.assertIsNotNone(self.student.popia_consent_at)

        # Verify Audit Log
        audit = AuditLog.objects.filter(action='ID_NUMBER_UPDATED', actor=self.student).first()
        self.assertIsNotNone(audit)
        self.assertIn('000101*****84', audit.metadata.get('masked_id', ''))

    def test_update_id_number_requires_popia_consent(self):
        """Ensure rejecting/missing POPIA consent returns a 400 Bad Request."""
        response = self.client.post('/api/users/update-id-number/', {
            'id_number': self.valid_id,
            'popia_consent': False
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("POPIA consent", response.data.get('error', ''))

        self.student.refresh_from_db()
        self.assertIsNone(self.student.id_number)
        self.assertFalse(self.student.popia_consent)

    def test_duplicate_id_number_rejected(self):
        """Ensure two users cannot register the same ID number."""
        # First student registers the ID
        self.student.id_number = self.valid_id
        self.student.popia_consent = True
        self.student.save()

        # Second student tries to register the same ID
        other_student = User.objects.create_user(
            email='other_student@test.com',
            password='TestPassword123!',
            first_name='Thabo',
            last_name='Molefe',
            role=User.Roles.STUDENT,
            campus='DFC'
        )
        self.client.force_authenticate(user=other_student)

        response = self.client.post('/api/users/update-id-number/', {
            'id_number': self.valid_id,
            'popia_consent': True
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already registered", response.data.get('error', ''))

    def test_passport_submission_success(self):
        """Ensure international students can submit a valid passport number."""
        response = self.client.post('/api/users/update-id-number/', {
            'id_type': 'PASSPORT',
            'id_number': 'A 12345678',
            'popia_consent': True
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('success'))

        self.student.refresh_from_db()
        self.assertEqual(self.student.id_type, User.IdentificationType.PASSPORT)
        self.assertEqual(self.student.id_number, 'A12345678')
        self.assertTrue(self.student.popia_consent)

        # Check Audit Log
        audit = AuditLog.objects.filter(action='ID_NUMBER_UPDATED', actor=self.student).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.metadata.get('id_type'), 'PASSPORT')

    def test_invalid_passport_rejected(self):
        """Ensure invalid passport formats (too short or invalid symbols) are rejected."""
        # Too short
        response = self.client.post('/api/users/update-id-number/', {
            'id_type': 'PASSPORT',
            'id_number': 'A12',
            'popia_consent': True
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Invalid characters
        response = self.client.post('/api/users/update-id-number/', {
            'id_type': 'PASSPORT',
            'id_number': 'A12345@#$',
            'popia_consent': True
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

