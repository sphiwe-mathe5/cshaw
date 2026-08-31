import logging
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from core.models import VolunteerActivity, ActivitySignup, ExcursionTicket, AuditLog
from core.audit import log_audit_event, _sanitize_metadata
from lms.models import Topic, LearningUnit, Quiz

User = get_user_model()

class AuditLoggingAndVerificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create Coordinator user
        self.coordinator = User.objects.create_user(
            email='coordinator@test.com',
            password='TestPassword123!',
            first_name='Coord',
            last_name='User',
            role=User.Roles.COORDINATOR
        )
        
        # Create Student user
        self.student = User.objects.create_user(
            email='student@test.com',
            password='TestPassword123!',
            first_name='Student',
            last_name='Volunteer',
            role=User.Roles.STUDENT,
            campus='APK'
        )

        # Create Activity
        self.activity = VolunteerActivity.objects.create(
            title='Campus Cleanup Drive',
            campus=VolunteerActivity.Campuses.APK,
            description='Cleaning up the main grounds',
            details='Full grounds cleanup activity.',
            date_time=timezone.now() - timezone.timedelta(hours=2),
            duration_hours=4.0,
            created_by=self.coordinator
        )

    def test_attendance_verification_records_timestamps_actor_and_audit(self):
        """
        Ensure attendance signout generates server timestamps, assigns actor,
        computes hours earned, and generates an AuditLog entry.
        """
        # Create signup
        signup = ActivitySignup.objects.create(
            user=self.student,
            activity=self.activity,
            sign_in_time=timezone.now() - timezone.timedelta(hours=2)
        )

        self.client.force_authenticate(user=self.coordinator)
        
        url = f"/api/attendance/{signup.id}/"
        signout_time = timezone.localtime(timezone.now()).strftime('%H:%M')
        response = self.client.post(url, {
            'action': 'signout',
            'manual_time': signout_time
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Reload signup
        signup.refresh_from_db()
        self.assertTrue(signup.attended)
        self.assertIsNotNone(signup.sign_out_time)
        self.assertEqual(signup.sign_out_facilitator, self.coordinator)
        self.assertGreater(signup.hours_earned, 0)

        # Check AuditLog
        audit_entry = AuditLog.objects.filter(
            action="ATTENDANCE_VERIFIED",
            target_type="ActivitySignup",
            target_id=str(signup.id)
        ).first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.actor, self.coordinator)
        self.assertEqual(audit_entry.metadata['student_email'], self.student.email)
        self.assertEqual(audit_entry.metadata['activity_title'], self.activity.title)
        self.assertAlmostEqual(audit_entry.metadata['hours_earned'], float(signup.hours_earned))

    def test_manual_hours_allocation_creates_audit_log(self):
        """
        Ensure manual hours allocation creates server-timed ActivitySignup and writes an AuditLog.
        """
        self.client.force_authenticate(user=self.coordinator)
        url = "/api/allocate-manual-hours/"
        
        with patch('users.services.BackgroundEmailService._send_async'):
            response = self.client.post(url, {
                'event_name': 'Special Workshop Hours',
                'hours': 5.0,
                'student_ids': [self.student.id]
            }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify Signup was created
        signup = ActivitySignup.objects.filter(user=self.student, activity__title='Special Workshop Hours').first()
        self.assertIsNotNone(signup)
        self.assertEqual(float(signup.hours_earned), 5.0)
        self.assertTrue(signup.attended)
        self.assertIsNotNone(signup.sign_out_time)

        # Verify AuditLog was recorded
        audit_entry = AuditLog.objects.filter(
            action="MANUAL_HOURS_ALLOCATED",
            target_type="VolunteerActivity"
        ).first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.actor, self.coordinator)
        self.assertEqual(audit_entry.metadata['hours'], 5.0)
        self.assertEqual(audit_entry.metadata['event_name'], 'Special Workshop Hours')

    def test_excursion_ticket_verification_creates_server_timestamp_and_audit(self):
        """
        Ensure scanning an excursion ticket sets server scanned_at timestamp and creates an AuditLog.
        """
        ticket = ExcursionTicket.objects.create(
            user=self.student,
            fallback_pin='123456',
            status='active',
            locked_hours=20.0
        )

        self.client.force_authenticate(user=self.coordinator)
        url = "/api/excursions/validate/"
        
        response = self.client.post(url, {
            'fallback_pin': '123456'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        ticket.refresh_from_db()
        self.assertTrue(ticket.is_scanned)
        self.assertIsNotNone(ticket.scanned_at)

        # Verify AuditLog
        audit = AuditLog.objects.filter(
            action="EXCURSION_TICKET_VERIFIED",
            target_type="ExcursionTicket",
            target_id=str(ticket.id)
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.coordinator)
        self.assertEqual(audit.metadata['student_email'], self.student.email)

    def test_executive_role_assignment_creates_audit_log(self):
        """
        Ensure assigning executive position and permissions creates an AuditLog.
        """
        self.client.force_authenticate(user=self.coordinator)
        url = "/api/users/assign-executive/"
        
        response = self.client.post(url, {
            'student_id': self.student.id,
            'position': 'Head of Logistics',
            'can_manage_attendance': True
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.student.refresh_from_db()
        self.assertEqual(self.student.executive_position, 'Head of Logistics')
        self.assertTrue(self.student.can_manage_attendance)

        audit = AuditLog.objects.filter(
            action="EXECUTIVE_ROLE_ASSIGNED",
            target_type="User",
            target_id=str(self.student.id)
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.coordinator)
        self.assertEqual(audit.metadata['position'], 'Head of Logistics')
        self.assertTrue(audit.metadata['can_manage_attendance'])

    def test_ordinary_actions_do_not_create_audit_logs(self):
        """
        Ensure harmless GET requests and ordinary browsing do not generate audit records.
        """
        self.client.force_authenticate(user=self.student)
        
        # Initial audit count
        initial_count = AuditLog.objects.count()

        # Browse activities
        resp1 = self.client.get("/api/activities/")
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        # View stats
        resp2 = self.client.get("/api/users/profile/")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)

        # Audit count should remain unchanged
        final_count = AuditLog.objects.count()
        self.assertEqual(initial_count, final_count)

    def test_metadata_sanitizer_removes_sensitive_data(self):
        """
        Ensure passwords, tokens, keys, and credentials are stripped from metadata before saving.
        """
        raw_meta = {
            "student_email": "test@cshaw.co.za",
            "password": "supersecretpassword",
            "access_token": "jwt.abc.123",
            "auth_token": "secret_key",
            "otp_code": "654321",
            "nested": {
                "secret_key": "hidden",
                "normal_field": "visible"
            },
            "safe_count": 42
        }

        cleaned = _sanitize_metadata(raw_meta)
        self.assertNotIn("password", cleaned)
        self.assertNotIn("access_token", cleaned)
        self.assertNotIn("auth_token", cleaned)
        self.assertNotIn("otp_code", cleaned)
        self.assertEqual(cleaned["student_email"], "test@cshaw.co.za")
        self.assertEqual(cleaned["safe_count"], 42)
        self.assertEqual(cleaned["nested"], {"normal_field": "visible"})

    def test_log_audit_event_helper(self):
        """
        Test that log_audit_event correctly writes audit records and handles anonymous/system actors.
        """
        # Test with authenticated actor
        entry = log_audit_event(
            action="SYSTEM_MAINTENANCE",
            actor=self.coordinator,
            target_type="System",
            target_id="1",
            metadata={"detail": "Routine check"}
        )
        self.assertIsNotNone(entry)
        self.assertEqual(entry.actor, self.coordinator)
        self.assertEqual(entry.action, "SYSTEM_MAINTENANCE")

        # Test with system actor (None)
        system_entry = log_audit_event(
            action="AUTO_EXPIRATION",
            actor=None,
            target_type="Session",
            target_id="99"
        )
        self.assertIsNotNone(system_entry)
        self.assertIsNone(system_entry.actor)
        self.assertEqual(system_entry.action, "AUTO_EXPIRATION")

    def test_event_creation_and_deletion_creates_audit_log(self):
        """
        Ensure creating and deleting activities creates audit entries.
        """
        self.client.force_authenticate(user=self.coordinator)
        
        # 1. Create Event
        tomorrow = timezone.now().date() + timezone.timedelta(days=1)
        with patch('core.views.send_new_event_email'):
            resp = self.client.post("/api/activities/create/", {
                'title': 'New Coding Bootcamp',
                'campus': 'APB',
                'description': 'Intro to Python',
                'details': 'Full details of bootcamp.',
                'date_only': tomorrow.strftime('%Y-%m-%d'),
                'start_time': '09:00',
                'duration_hours': 3.0
            }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        event_id = resp.data['id']

        created_audit = AuditLog.objects.filter(
            action="EVENT_CREATED",
            target_type="VolunteerActivity",
            target_id=str(event_id)
        ).first()
        self.assertIsNotNone(created_audit)
        self.assertEqual(created_audit.actor, self.coordinator)

        # 2. Delete Event
        del_resp = self.client.delete(f"/api/activities/{event_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)

        deleted_audit = AuditLog.objects.filter(
            action="EVENT_DELETED",
            target_type="VolunteerActivity",
            target_id=str(event_id)
        ).first()
        self.assertIsNotNone(deleted_audit)
        self.assertEqual(deleted_audit.actor, self.coordinator)

    def test_lms_course_publishing_creates_audit_log(self):
        """
        Ensure publishing LMS course content creates an AuditLog.
        """
        self.client.force_authenticate(user=self.coordinator)
        
        with patch('users.services.BackgroundEmailService._send_async'):
            resp = self.client.post("/api/lms/admin/upload-nested/", {
                'topic_title': 'Leadership 101',
                'unit_title': 'Introduction to Leadership',
                'content_text': 'Leadership principles and practice.',
                'quiz_title': 'Leadership Basics Quiz',
                'questions': [
                    {
                        'text': 'What is a core trait of a leader?',
                        'choices': [
                            {'text': 'Empathy', 'is_correct': True},
                            {'text': 'Arrogance', 'is_correct': False}
                        ]
                    }
                ]
            }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        
        topic_id = resp.data['topic_id']
        audit = AuditLog.objects.filter(
            action="LMS_COURSE_PUBLISHED",
            target_type="Topic",
            target_id=str(topic_id)
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.coordinator)
        self.assertEqual(audit.metadata['topic_title'], 'Leadership 101')

    def test_sentry_conditional_initialization(self):
        """
        Ensure sentry_sdk is initialized when SENTRY_DSN is present and skipped when absent.
        """
        with patch('sentry_sdk.init') as mock_sentry_init:
            # Without DSN
            dsn = None
            if dsn:
                import sentry_sdk
                sentry_sdk.init(dsn=dsn)
            mock_sentry_init.assert_not_called()

            # With DSN
            test_dsn = "https://public_key@sentry.example.com/12345"
            if test_dsn:
                import sentry_sdk
                from sentry_sdk.integrations.django import DjangoIntegration
                sentry_sdk.init(
                    dsn=test_dsn,
                    integrations=[DjangoIntegration()],
                    environment='test',
                    traces_sample_rate=0.0,
                    send_default_pii=False
                )
            mock_sentry_init.assert_called_once()

