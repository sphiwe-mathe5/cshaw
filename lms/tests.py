from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from lms.models import Topic, LearningUnit, Quiz, Question, Choice, StudentProgress

User = get_user_model()

class LMSReportExportTests(TestCase):
    def setUp(self):
        self.coordinator = User.objects.create_user(
            email='coord_lms@test.com',
            password='password123',
            first_name='Coordinator',
            last_name='User',
            role=User.Roles.COORDINATOR
        )
        self.student = User.objects.create_user(
            email='student_lms@test.com',
            password='password123',
            first_name='Student',
            last_name='Learner',
            role=User.Roles.STUDENT,
            campus='APB',
            volunteer_status=User.VolunteerStatus.SENIOR
        )
        self.newcomer = User.objects.create_user(
            email='newcomer_lms@test.com',
            password='password123',
            first_name='New',
            last_name='Volunteer',
            role=User.Roles.STUDENT,
            campus='APK',
            volunteer_status=User.VolunteerStatus.NEWCOMER
        )

        # Create topic, unit, quiz
        self.topic = Topic.objects.create(title="Sexual Health & Prevention", order=1)
        self.unit = LearningUnit.objects.create(
            topic=self.topic,
            title="Introduction to Condom Distribution",
            content_text="<p>Safety and protocol guidelines.</p>",
            order=1
        )
        self.quiz = Quiz.objects.create(
            learning_unit=self.unit,
            title="Condom Protocol Assessment",
            points_awarded=10
        )
        self.question = Question.objects.create(quiz=self.quiz, text="What is the first step?")
        Choice.objects.create(question=self.question, text="Check expiry date", is_correct=True)
        Choice.objects.create(question=self.question, text="Ignore packaging", is_correct=False)

        # Student progress
        StudentProgress.objects.create(
            user=self.student,
            quiz=self.quiz,
            score=100.0,
            points_earned=10
        )
        StudentProgress.objects.create(
            user=self.newcomer,
            quiz=self.quiz,
            score=50.0,
            points_earned=0
        )

        self.export_url = reverse('lms-export-report-pdf')

    def test_coordinator_can_download_pdf_report(self):
        self.client.force_login(self.coordinator)
        response = self.client.get(self.export_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('attachment; filename=', response['Content-Disposition'])
        self.assertIn('CSHAW_LMS_Course_Completion_Report_', response['Content-Disposition'])
        self.assertGreater(len(response.content), 500)

    def test_student_cannot_download_pdf_report(self):
        self.client.force_login(self.student)
        response = self.client.get(self.export_url)
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_user_cannot_download_pdf_report(self):
        response = self.client.get(self.export_url)
        self.assertEqual(response.status_code, 403)
