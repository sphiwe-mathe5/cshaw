import json
import uuid
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
from core.models import CampTicket, CampLeaderboardSnapshot, VolunteerActivity, ActivitySignup
from core.camp_views import build_year_in_review_stats, MAX_CAMP_SEATS
from lms.models import Topic, LearningUnit, Quiz, StudentProgress

User = get_user_model()

class CampTicketTests(TestCase):
    def setUp(self):
        self.client = Client()
        
        # 1. Create Coordinator
        self.coordinator = User.objects.create_user(
            email='coordinator@uj.ac.za',
            password='password123',
            role='COORDINATOR',
            first_name='Coordinator',
            last_name='UJ'
        )
        
        # 2. Create Students with varying hours
        self.students = []
        for i in range(1, 85):
            s = User.objects.create_user(
                email=f'student{i}@uj.ac.za',
                password='password123',
                role='STUDENT',
                first_name=f'Student{i}',
                last_name='PE',
                campus='APK' if i % 2 == 0 else 'DFC',
                volunteer_status='SENIOR' if i <= 10 else 'NEWCOMER'
            )
            s.manual_bonus_hours = float(100 - i) # Top students have higher hours
            s.save()
            self.students.append(s)

        # 3. Create LMS data for top student
        top_student = self.students[0]
        topic1 = Topic.objects.create(title="Condom Distribution & Conduct", order=1)
        unit1 = LearningUnit.objects.create(topic=topic1, title="Core Unit 1", content_text="Text", order=1)
        quiz1 = Quiz.objects.create(learning_unit=unit1, title="Conduct Quiz")
        StudentProgress.objects.create(user=top_student, quiz=quiz1, score=90.0, points_earned=50)

        # 4. Create Activity data for top student
        act = VolunteerActivity.objects.create(
            title="Mass Testing Campaign",
            campus="APK",
            description="Testing Drive",
            details="Full Details",
            date_time="2026-08-15 09:00:00",
            created_by=self.coordinator
        )
        ActivitySignup.objects.create(user=top_student, activity=act, attended=True)

    def test_year_in_review_aggregation(self):
        top_student = self.students[0]
        stats = build_year_in_review_stats(top_student, rank=1, locked_hours=99.0)
        
        self.assertEqual(stats['hours'], 99.0)
        self.assertIn("Condom Distribution", stats['lms_summary'])
        self.assertEqual(stats['drives_count'], 1)
        self.assertIn("Mass Testing", stats['drives_summary'])
        self.assertIn("Top 5 Impact Leader", stats['honor_title'])

    def test_generate_camp_tickets_enforces_78_cap(self):
        self.client.force_login(self.coordinator)
        res = self.client.post(reverse('generate-camp-tickets'))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        
        # Exactly 78 tickets should be generated
        self.assertEqual(data['generated'], 78)
        self.assertEqual(CampTicket.objects.filter(status='active').count(), 78)
        
        # Snapshot should be created for all active students
        self.assertTrue(CampLeaderboardSnapshot.objects.exists())
        
        # Student 85 (low hours) should NOT have a ticket
        low_student = self.students[-1]
        self.assertFalse(CampTicket.objects.filter(user=low_student).exists())
        
        # Top student should be Rank 1
        top_ticket = CampTicket.objects.get(user=self.students[0])
        self.assertEqual(top_ticket.cohort_rank, 1)
        self.assertEqual(top_ticket.locked_hours, 99.0)

    def test_my_camp_ticket_api_for_qualifier(self):
        # Generate tickets
        self.client.force_login(self.coordinator)
        self.client.post(reverse('generate-camp-tickets'))
        
        # Login as top student
        self.client.force_login(self.students[0])
        res = self.client.get(reverse('my-camp-ticket'))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        
        self.assertTrue(data['has_ticket'])
        self.assertEqual(data['ticket']['cohort_rank'], 1)
        self.assertEqual(data['ticket']['event_theme'], "Black Elegance")
        self.assertIn("Condom Distribution", data['ticket']['lms_modules_summary'])

    def test_student_cancel_rsvp_and_reallocation(self):
        self.client.force_login(self.coordinator)
        self.client.post(reverse('generate-camp-tickets'))
        
        # Student 1 cancels RSVP
        self.client.force_login(self.students[0])
        res = self.client.post(reverse('cancel-camp-rsvp'))
        self.assertEqual(res.status_code, 200)
        
        t1 = CampTicket.objects.get(user=self.students[0])
        self.assertEqual(t1.status, 'revoked')
        
        # 1 seat is now open! Coordinator generates again
        self.client.force_login(self.coordinator)
        res2 = self.client.post(reverse('generate-camp-tickets'))
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertEqual(data2['generated'], 1)
        
        # Student #79 should now have the ticket!
        student79 = self.students[78]
        self.assertTrue(CampTicket.objects.filter(user=student79, status='active').exists())

    def test_confirm_camp_attendance(self):
        self.client.force_login(self.coordinator)
        self.client.post(reverse('generate-camp-tickets'))
        
        self.client.force_login(self.students[0])
        res = self.client.post(
            reverse('confirm-camp-attendance'),
            data=json.dumps({'tshirt_size': 'L'}),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        
        t = CampTicket.objects.get(user=self.students[0])
        self.assertEqual(t.status, 'confirmed')
        self.assertEqual(t.tshirt_size, 'L')

    def test_validate_camp_ticket_via_pin_and_uuid(self):
        self.client.force_login(self.coordinator)
        self.client.post(reverse('generate-camp-tickets'))
        
        t = CampTicket.objects.get(user=self.students[0])
        
        # Validate via PIN
        res = self.client.post(
            reverse('validate-camp-ticket'),
            data=json.dumps({'identifier': t.fallback_pin}),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['valid'])
        
        t.refresh_from_db()
        self.assertTrue(t.is_scanned)
        
        # Second scan should report already scanned
        res2 = self.client.post(
            reverse('validate-camp-ticket'),
            data=json.dumps({'identifier': str(t.ticket_uuid)}),
            content_type='application/json'
        )
        self.assertEqual(res2.status_code, 200)
        self.assertTrue(res2.json()['already_scanned'])

    def test_reset_camp_tickets(self):
        self.client.force_login(self.coordinator)
        self.client.post(reverse('generate-camp-tickets'))
        self.assertEqual(CampTicket.objects.count(), 78)
        
        res = self.client.post(reverse('reset-camp-tickets'))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(CampTicket.objects.count(), 0)
        self.assertEqual(CampLeaderboardSnapshot.objects.count(), 0)

    def test_ineligible_student_banned_from_camp_and_reallocated(self):
        # 1. Mark top student as ineligible BEFORE ticket generation
        top_student = self.students[0]
        top_student.is_camp_eligible = False
        top_student.save()

        # Coordinator generates tickets
        self.client.force_login(self.coordinator)
        res = self.client.post(reverse('generate-camp-tickets'))
        self.assertEqual(res.status_code, 200)

        # Ineligible student should NOT receive a ticket
        self.assertFalse(CampTicket.objects.filter(user=top_student).exists())

        # Total active tickets should still reach the 78 cap
        self.assertEqual(CampTicket.objects.filter(status='active').count(), 78)

        # Student #79 should have been bumped in to receive a ticket
        student79 = self.students[78]
        self.assertTrue(CampTicket.objects.filter(user=student79, status='active').exists())

        # Ineligible student viewing ticket API
        self.client.force_login(top_student)
        my_res = self.client.get(reverse('my-camp-ticket'))
        self.assertEqual(my_res.status_code, 200)
        self.assertFalse(my_res.json()['has_ticket'])
        self.assertTrue(my_res.json().get('is_ineligible'))

    def test_revoking_ticket_when_user_marked_ineligible_afterwards(self):
        # 1. Generate tickets first (student 1 is eligible)
        self.client.force_login(self.coordinator)
        self.client.post(reverse('generate-camp-tickets'))
        
        t = CampTicket.objects.get(user=self.students[0])
        self.assertEqual(t.status, 'active')

        # 2. Coordinator bans student 1 via Admin / profile save
        top_student = self.students[0]
        top_student.is_camp_eligible = False
        top_student.save()

        # Ticket should automatically be revoked
        t.refresh_from_db()
        self.assertEqual(t.status, 'revoked')

        # 3. Next generation reallocates the seat to Student #79
        res2 = self.client.post(reverse('generate-camp-tickets'))
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()['generated'], 1)

        student79 = self.students[78]
        self.assertTrue(CampTicket.objects.filter(user=student79, status='active').exists())

        # 4. Scanner attempting to validate revoked/ineligible ticket
        val_res = self.client.post(
            reverse('validate-camp-ticket'),
            data=json.dumps({'identifier': t.fallback_pin}),
            content_type='application/json'
        )
        self.assertEqual(val_res.status_code, 200)
        self.assertFalse(val_res.json()['valid'])
        self.assertTrue(val_res.json()['is_revoked'])

    def test_export_camp_manifest_pdf(self):
        self.client.force_login(self.coordinator)
        self.client.post(reverse('generate-camp-tickets'))

        # Cancel one ticket so revoked tickets exist in the report
        self.client.force_login(self.students[0])
        self.client.post(reverse('cancel-camp-rsvp'))

        # Download PDF as coordinator
        self.client.force_login(self.coordinator)
        res = self.client.get(reverse('export-camp-manifest-pdf'))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertTrue(len(res.content) > 1000)

    def test_coordinator_reinstate_camp_ticket(self):
        self.client.force_login(self.coordinator)
        self.client.post(reverse('generate-camp-tickets'))

        t0 = CampTicket.objects.get(user=self.students[0])
        # Revoke student 0's ticket
        self.client.post(reverse('cancel-camp-rsvp'), data={'ticket_id': t0.id})
        t0.refresh_from_db()
        self.assertEqual(t0.status, 'revoked')

        # Coordinator reinstates student 0's ticket
        res = self.client.post(
            reverse('reinstate-camp-ticket'),
            data=json.dumps({'ticket_id': t0.id}),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'success')

        t0.refresh_from_db()
        self.assertEqual(t0.status, 'active')
        self.assertTrue(t0.user.is_camp_eligible)

        # Attempt to reinstate when full: generate seat 78 so active is 78
        # Now active count is 78. Let's create another revoked ticket
        t_revoked = CampTicket.objects.create(
            user=self.students[80],
            fallback_pin='999888',
            status='revoked',
            cohort_rank=81
        )
        res_full = self.client.post(
            reverse('reinstate-camp-ticket'),
            data=json.dumps({'ticket_id': t_revoked.id}),
            content_type='application/json'
        )
        self.assertEqual(res_full.status_code, 400)
        self.assertIn('All 78 seats are currently full', res_full.json()['error'])

    def test_executive_scanner_pipeline(self):
        # 1. Generate tickets for top 78 students
        self.client.force_login(self.coordinator)
        self.client.post(reverse('generate-camp-tickets'))

        # Student 0 is Rank 1, make student 0 an executive
        exec_attending = self.students[0]
        exec_attending.executive_position = 'Chairperson'
        exec_attending.save()

        # Student 82 is low hours (no ticket generated), make student 82 an executive who didn't qualify
        exec_no_ticket = self.students[82]
        exec_no_ticket.executive_position = 'Secretary'
        exec_no_ticket.save()

        # Student 1 is Rank 2 (holds a ticket), make student 1 an executive whose ticket gets revoked
        exec_revoked = self.students[1]
        exec_revoked.executive_position = 'Treasurer'
        exec_revoked.save()
        t1 = CampTicket.objects.get(user=exec_revoked)
        t1.status = 'revoked'
        t1.save()

        # Student 2 is a regular student (attending camp, but NOT an executive)
        regular_student = self.students[2]

        # Target student to scan
        target_student = self.students[3]
        target_ticket = CampTicket.objects.get(user=target_student)

        # CASE A: Regular student tries to access scanner dashboard -> 403 Denied
        self.client.force_login(regular_student)
        res = self.client.get(reverse('scanner-dashboard'))
        self.assertEqual(res.status_code, 403)
        res_val = self.client.post(reverse('validate-ticket'), {'fallback_pin': target_ticket.fallback_pin})
        self.assertEqual(res_val.status_code, 403)

        # CASE B: Executive who didn't qualify (no ticket) -> 403 Denied
        self.client.force_login(exec_no_ticket)
        res = self.client.get(reverse('scanner-dashboard'))
        self.assertEqual(res.status_code, 403)
        self.assertIn('Only executives who qualified', res.content.decode())
        res_val = self.client.post(reverse('validate-ticket'), {'fallback_pin': target_ticket.fallback_pin})
        self.assertEqual(res_val.status_code, 403)

        # CASE C: Executive whose ticket was revoked -> 403 Denied
        self.client.force_login(exec_revoked)
        res = self.client.get(reverse('scanner-dashboard'))
        self.assertEqual(res.status_code, 403)
        self.assertIn('Your Year-End Camp ticket was cancelled or revoked', res.content.decode())
        res_val = self.client.post(reverse('validate-ticket'), {'fallback_pin': target_ticket.fallback_pin})
        self.assertEqual(res_val.status_code, 403)

        # CASE D: Executive who is attending -> 200 OK & Can scan via PIN or QR
        self.client.force_login(exec_attending)
        res = self.client.get(reverse('scanner-dashboard'))
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, 'QR Code Scanner')
        self.assertContains(res, 'Verify PIN')
        # Section A coordinator controls should NOT be visible to executives
        self.assertNotContains(res, 'id="resetCampBtn"')
        self.assertNotContains(res, 'id="generateCampBtn"')

        # Executive scans target student's ticket via PIN
        res_val = self.client.post(reverse('validate-ticket'), {'fallback_pin': target_ticket.fallback_pin})
        self.assertEqual(res_val.status_code, 200)
        self.assertEqual(res_val.json()['status'], 'success')
        target_ticket.refresh_from_db()
        self.assertTrue(target_ticket.is_scanned)

        # CASE E: Reinstatement allows revoked executive to regain scanner access
        self.client.force_login(self.coordinator)
        # First revoke student 4 to free up a seat
        t4 = CampTicket.objects.get(user=self.students[4])
        t4.status = 'revoked'
        t4.save()
        # Reinstate exec_revoked
        res_reinstate = self.client.post(
            reverse('reinstate-camp-ticket'),
            data=json.dumps({'ticket_id': t1.id}),
            content_type='application/json'
        )
        self.assertEqual(res_reinstate.status_code, 200)

        # Now exec_revoked can access scanner dashboard
        self.client.force_login(exec_revoked)
        res_after = self.client.get(reverse('scanner-dashboard'))
        self.assertEqual(res_after.status_code, 200)



