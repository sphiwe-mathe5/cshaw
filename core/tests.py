from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from core.models import VolunteerActivity, ActivitySignup

User = get_user_model()

class QuarterlyReportTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.coordinator = User.objects.create_user(
            email='coord_report@uj.ac.za',
            password='password123',
            role='COORDINATOR',
            first_name='Coord',
            last_name='Report'
        )
        self.student = User.objects.create_user(
            email='student_report@uj.ac.za',
            password='password123',
            role='STUDENT',
            first_name='Student',
            last_name='Report',
            campus='APK'
        )

        # Create activity with unicode en-dash, smart quotes, bullets, and accents
        self.activity = VolunteerActivity.objects.create(
            title="Year-End Camp 2026 – Black Elegance (Women’s Day • UJ Gala)",
            campus="APK",
            date_time=timezone.now(),
            created_by=self.coordinator
        )
        ActivitySignup.objects.create(
            user=self.student,
            activity=self.activity,
            attended=True,
            sign_in_time=timezone.now()
        )

    def test_download_quarterly_pdf_with_unicode(self):
        self.client.force_login(self.coordinator)
        res = self.client.get(reverse('quarterly-download') + f'?year={timezone.now().year}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertTrue(len(res.content) > 500)
        self.assertIn(f'Annual_Report_{timezone.now().year}.pdf', res['Content-Disposition'])

    def test_download_event_report_pdf_with_unicode(self):
        self.client.force_login(self.coordinator)
        res = self.client.get(reverse('report-download', kwargs={'pk': self.activity.pk}))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertTrue(len(res.content) > 500)
