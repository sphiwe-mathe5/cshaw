import logging
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.views.generic import TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth import get_user_model
from django.conf import settings
from django.template.loader import render_to_string

from core.audit import log_audit_event
from users.permissions import IsCoordinator
from users.services import BackgroundEmailService
from .models import Topic, LearningUnit, Quiz, Question, Choice, StudentProgress
from .serializers import (
    TopicSerializer, LearningUnitSerializer, QuizSerializer, 
    QuestionSerializer, ChoiceSerializer, StudentProgressSerializer
)

logger = logging.getLogger('lms')

class LMSPermission(permissions.BasePermission):
    """
    - Read operations (GET, HEAD, OPTIONS): Anyone (including unauthenticated visitors on index page).
    - Quiz submission (POST to submit action): Any authenticated user.
    - Content modifications (POST, PUT, PATCH, DELETE): Only Coordinators, Staff, or Superusers.
    """
    def has_permission(self, request, view):
        # Read-only operations allowed for everyone
        if request.method in permissions.SAFE_METHODS:
            return True

        if not (request.user and request.user.is_authenticated):
            return False

        # Quiz submission allowed for all authenticated users
        if getattr(view, 'action', None) == 'submit':
            return True

        # Modification actions (create/update/delete topics, units, quizzes) restricted to Coordinators
        return bool(request.user.role == 'COORDINATOR' or request.user.is_staff or request.user.is_superuser)

class TopicViewSet(viewsets.ModelViewSet):
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer
    permission_classes = [LMSPermission]

class LearningUnitViewSet(viewsets.ModelViewSet):
    queryset = LearningUnit.objects.all()
    serializer_class = LearningUnitSerializer
    permission_classes = [LMSPermission]

    def destroy(self, request, *args, **kwargs):
        unit = self.get_object()
        topic = unit.topic
        topic_id = topic.id
        topic_title = topic.title
        unit_title = unit.title

        log_audit_event(
            action="LMS_COURSE_DELETED",
            actor=request.user,
            target_type="Topic",
            target_id=topic_id,
            metadata={"topic_title": topic_title, "unit_title": unit_title}
        )
        logger.info("LMS topic/course deleted: '%s' (ID: %s) by %s", topic_title, topic_id, request.user.email)

        # Deleting a unit deletes everything including the topic
        topic.delete() 
        return Response(status=status.HTTP_204_NO_CONTENT)

class QuizViewSet(viewsets.ModelViewSet):
    queryset = Quiz.objects.all()
    serializer_class = QuizSerializer
    permission_classes = [LMSPermission]

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def submit(self, request, pk=None):
        """
        POST /api/lms/quizzes/<id>/submit/
        Body format: { "answers": { "question_id_1": choice_id_a, "question_id_2": choice_id_b } }
        """
        quiz = self.get_object_or_404(Quiz, pk=pk)
        user = request.user
        
        # Check if attempt exists (only 1 attempt allowed)
        if StudentProgress.objects.filter(user=user, quiz=quiz).exists():
            return Response({"error": "You have already attempted this quiz. Only 1 attempt is allowed."}, status=status.HTTP_400_BAD_REQUEST)

        answers = request.data.get('answers', {})

        questions = quiz.questions.all()
        if not questions.exists():
            return Response({"error": "This quiz has no questions."}, status=status.HTTP_400_BAD_REQUEST)

        total_questions = questions.count()
        correct_count = 0

        # Calculate score
        for q in questions:
            submitted_choice_id = answers.get(str(q.id)) or answers.get(q.id)
            if submitted_choice_id:
                try:
                    choice = Choice.objects.get(id=submitted_choice_id, question=q)
                    if choice.is_correct:
                        correct_count += 1
                except Choice.DoesNotExist:
                    pass

        score_percent = round((correct_count / total_questions) * 100.0, 1)
        passed = score_percent >= 50.0  # 50% passing threshold
        is_outstanding = score_percent >= 70.0  # 70%+ is Outstanding
        points_earned = correct_count * 2  # 2 points awarded per correct question

        # Save student progress & award points
        with transaction.atomic():
            progress, created = StudentProgress.objects.get_or_create(
                user=user,
                quiz=quiz,
                defaults={'score': score_percent, 'points_earned': points_earned}
            )

            if created:
                user.points += points_earned
                user.save(update_fields=['points'])
                points_added = points_earned
            else:
                # If retried and scored higher points, award the difference
                points_added = max(0, points_earned - progress.points_earned)
                if points_added > 0:
                    user.points += points_added
                    user.save(update_fields=['points'])
                progress.score = score_percent
                progress.points_earned = max(progress.points_earned, points_earned)
                progress.save()

        return Response({
            "score": score_percent,
            "passed": passed,
            "is_outstanding": is_outstanding,
            "correct_count": correct_count,
            "incorrect_count": max(0, total_questions - correct_count),
            "total_questions": total_questions,
            "points_earned": points_earned,
            "points_added": points_added,
            "total_user_points": user.points
        }, status=status.HTTP_200_OK)

    def get_object_or_404(self, klass, *args, **kwargs):
        return get_object_or_404(klass, *args, **kwargs)

class QuizListView(APIView):
    """
    GET /api/lms/quizzes/
    Lists all uploaded quizzes with completed status and scores.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        quizzes = Quiz.objects.all()
        serializer = QuizSerializer(quizzes, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

from django.conf import settings
import json
from django.shortcuts import redirect
from users.services import BackgroundEmailService
from django.template.loader import render_to_string
from django.contrib.auth import get_user_model

class AdminContentUploadView(APIView):
    """
    POST /api/lms/admin/upload-nested/
    Secure nested upload endpoint for coordinators.
    """
    permission_classes = [permissions.IsAuthenticated, IsCoordinator]

    def post(self, request):
        topic_id = request.data.get('topic_id')
        topic_title = (request.data.get('topic_title') or '').strip()
        unit_title = (request.data.get('unit_title') or '').strip()
        content_text = (request.data.get('content_text') or '').strip()
        quiz_title = (request.data.get('quiz_title') or '').strip()
        questions_data = request.data.get('questions', [])

        if not unit_title:
            return Response({"error": "Unit Title is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not content_text or content_text == '<p><br></p>':
            return Response({"error": "Unit Content cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
        if not quiz_title:
            return Response({"error": "Quiz Title is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Parse questions if string
        if isinstance(questions_data, str):
            try:
                questions_data = json.loads(questions_data)
            except json.JSONDecodeError:
                return Response({"error": "Invalid format for questions data JSON string."}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(questions_data, list) or len(questions_data) == 0:
            return Response({"error": "At least one quiz question with choices is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate questions & choices structure
        for idx, q_item in enumerate(questions_data, start=1):
            q_text = (q_item.get('text') or '').strip()
            if not q_text:
                return Response({"error": f"Question {idx} is missing question text."}, status=status.HTTP_400_BAD_REQUEST)
            choices = q_item.get('choices', [])
            if not isinstance(choices, list) or len(choices) < 2:
                return Response({"error": f"Question {idx} ('{q_text[:30]}...') must have at least 2 choices."}, status=status.HTTP_400_BAD_REQUEST)
            has_correct = any(bool(c.get('is_correct')) for c in choices)
            if not has_correct:
                return Response({"error": f"Question {idx} ('{q_text[:30]}...') must have one correct choice selected."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                # 1. Resolve Topic
                if topic_id:
                    try:
                        topic = Topic.objects.get(id=topic_id)
                    except Topic.DoesNotExist:
                        return Response({"error": "Selected topic does not exist."}, status=status.HTTP_400_BAD_REQUEST)
                elif topic_title:
                    order = Topic.objects.count() + 1
                    topic, _ = Topic.objects.get_or_create(title=topic_title, defaults={'order': order})
                else:
                    return Response({"error": "Please select an existing topic or enter a new topic title."}, status=status.HTTP_400_BAD_REQUEST)

                # 2. Create Learning Unit
                unit_order = LearningUnit.objects.filter(topic=topic).count() + 1
                learning_unit = LearningUnit.objects.create(
                    topic=topic,
                    title=unit_title,
                    content_text=content_text,
                    order=unit_order
                )

                # Calculate points: 2 points per question
                calculated_points = len(questions_data) * 2

                # 3. Create Quiz
                quiz = Quiz.objects.create(
                    learning_unit=learning_unit,
                    title=quiz_title,
                    points_awarded=calculated_points
                )

                # 4. Create Questions & Choices
                for q_item in questions_data:
                    q_text = q_item.get('text', '').strip()
                    if not q_text:
                        continue
                    question = Question.objects.create(quiz=quiz, text=q_text)

                    choices = q_item.get('choices', [])
                    for c_item in choices:
                        c_text = (c_item.get('text') or '').strip()
                        c_correct = c_item.get('is_correct', False)
                        if c_text:
                            Choice.objects.create(
                                question=question,
                                text=c_text,
                                is_correct=bool(c_correct)
                            )

            log_audit_event(
                action="LMS_COURSE_PUBLISHED",
                actor=request.user,
                target_type="Topic",
                target_id=topic.id,
                metadata={
                    "topic_title": topic.title,
                    "unit_title": learning_unit.title,
                    "quiz_title": quiz.title,
                    "points": quiz.points_awarded
                }
            )
            logger.info("LMS course published: '%s' -> '%s' (Points: %d) by %s", topic.title, learning_unit.title, quiz.points_awarded, request.user.email)

            # ----- SEND BACKGROUND EMAIL NOTIFICATION -----
            try:
                User = get_user_model()
                students = User.objects.filter(role=User.Roles.STUDENT, receive_notifications=True)
                student_emails = list(students.values_list('email', flat=True))

                if student_emails:
                    hub_link = request.build_absolute_uri('/learning-hub/') if request else "https://cshaw.co.za/learning-hub/"
                    context = {
                        'topic_title': topic.title,
                        'unit_title': learning_unit.title,
                        'quiz_title': quiz.title,
                        'points': quiz.points_awarded,
                        'link': hub_link
                    }
                    html_message = render_to_string('lms/emails/new_course.html', context)
                    subject = f"New Course Available: {topic.title} 📚"

                    BackgroundEmailService._send_async(
                        subject=subject,
                        to_emails=[settings.DEFAULT_FROM_EMAIL],
                        bcc_emails=student_emails,
                        html_content=html_message
                    )
            except Exception as email_err:
                logger.error("LMS Email Notification Error: %s", email_err, exc_info=True)

            return Response({
                "message": "Course content published successfully!",
                "topic_id": topic.id,
                "unit_id": learning_unit.id,
                "quiz_id": quiz.id
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error("Error creating course content: %s", e, exc_info=True)
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

class LMSFrontendView(LoginRequiredMixin, TemplateView):
    template_name = 'lms/index.html'

class CourseCreateView(LoginRequiredMixin, TemplateView):
    template_name = 'lms/create_course.html'

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return self.handle_no_permission()
        if request.user.role != 'COORDINATOR':
            return redirect('/learning-hub/')
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['topics'] = Topic.objects.all().order_by('order', 'id')
        return context


def export_lms_completion_report_pdf(request):
    """
    Export clean, comprehensive LMS course completion and marks report in PDF format.
    STRICTLY restricted to Coordinators, staff, and superusers.
    """
    from django.http import HttpResponseForbidden, HttpResponse
    if not (request.user.is_authenticated and (getattr(request.user, 'role', '') == 'COORDINATOR' or request.user.is_staff or request.user.is_superuser)):
        return HttpResponseForbidden("Only coordinators can download LMS course completion reports.")

    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from django.utils import timezone

    log_audit_event(
        action="LMS_REPORT_DOWNLOADED",
        actor=request.user,
        target_type="System",
        target_id=request.user.id,
        metadata={"report_name": "LMS_Course_Completion_Report"}
    )
    logger.info("LMS course completion report downloaded by %s", request.user.email)

    response = HttpResponse(content_type='application/pdf')
    filename = f"CSHAW_LMS_Course_Completion_Report_{timezone.now().strftime('%Y%m%d_%H%M')}.pdf"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'

    doc = SimpleDocTemplate(
        response,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    PRIMARY_ORANGE = colors.HexColor('#ff6b1a')
    DARK_NAVY = colors.HexColor('#0f172a')
    SLATE_GREY = colors.HexColor('#475569')
    LIGHT_BG = colors.HexColor('#f8fafc')
    BORDER_COLOR = colors.HexColor('#e2e8f0')
    GREEN_SUCCESS = colors.HexColor('#166534')
    RED_FAIL = colors.HexColor('#991b1b')

    title_style = ParagraphStyle(
        'LmsDocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=21,
        textColor=PRIMARY_ORANGE
    )

    meta_style = ParagraphStyle(
        'LmsMetaStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=DARK_NAVY
    )

    section_heading = ParagraphStyle(
        'LmsSectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=DARK_NAVY,
        spaceBefore=12,
        spaceAfter=5
    )

    subsection_heading = ParagraphStyle(
        'LmsSubSectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=12,
        textColor=DARK_NAVY,
        spaceBefore=6,
        spaceAfter=3
    )

    cell_style = ParagraphStyle(
        'LmsCellRegular',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=DARK_NAVY
    )

    cell_header = ParagraphStyle(
        'LmsCellHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    badge_outstanding = ParagraphStyle(
        'LmsBadgeOutstanding',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor('#d97706')
    )

    badge_pass = ParagraphStyle(
        'LmsBadgePass',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        textColor=GREEN_SUCCESS
    )

    badge_fail = ParagraphStyle(
        'LmsBadgeFail',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        textColor=RED_FAIL
    )

    story = []

    # 1. Header Banner
    header_table_data = [
        [
            Paragraph("<b>C-SHAW LEARNING HUB</b><br/><font size=9 color='#475569'>Course Completion & Assessment Marks Report</font><br/><font size=7.5 color='#94a3b8'>Centre for Student Health and Wellness • Peer Education Hub</font>", title_style),
            Paragraph(f"<b>Issued:</b> {timezone.now().strftime('%d %B %Y, %H:%M')}<br/><b>Coordinator:</b> {request.user.first_name} {request.user.last_name}<br/><b>Status:</b> Official Record", meta_style)
        ]
    ]
    header_table = Table(header_table_data, colWidths=[335, 188])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_ORANGE, spaceBefore=2, spaceAfter=10))

    # 2. Executive Summary Metrics
    total_topics = Topic.objects.count()
    total_units = LearningUnit.objects.count()
    total_quizzes = Quiz.objects.count()
    all_progress = StudentProgress.objects.select_related('user', 'quiz')
    total_completions = all_progress.count()
    unique_students = all_progress.values('user').distinct().count()
    total_passed = all_progress.filter(score__gte=50.0).count()
    total_outstanding = all_progress.filter(score__gte=70.0).count()
    overall_pass_rate = round((total_passed / total_completions * 100), 1) if total_completions > 0 else 0.0
    total_points = sum(p.points_earned for p in all_progress)

    summary_data = [
        [
            Paragraph(f"<b>Active Courses</b><br/><font size=11 color='#0f172a'><b>{total_topics} Topics</b></font><br/><font size=7 color='#64748b'>{total_units} Modules · {total_quizzes} Quizzes</font>", cell_style),
            Paragraph(f"<b>Total Submissions</b><br/><font size=11 color='#0f172a'><b>{total_completions}</b></font><br/><font size=7 color='#64748b'>Across all modules</font>", cell_style),
            Paragraph(f"<b>Unique Learners</b><br/><font size=11 color='#2563eb'><b>{unique_students} Students</b></font><br/><font size=7 color='#64748b'>Engaged volunteers</font>", cell_style),
            Paragraph(f"<b>Overall Pass Rate</b><br/><font size=11 color='#166534'><b>{overall_pass_rate}%</b></font><br/><font size=6.5 color='#64748b'>{total_passed} passed (≥50%)<br/>{total_outstanding} outstanding (≥70%)</font>", cell_style),
            Paragraph(f"<b>Points Distributed</b><br/><font size=11 color='#ff6b1a'><b>+{total_points} Pts</b></font><br/><font size=7 color='#64748b'>Awarded learning pts</font>", cell_style),
        ]
    ]
    summary_table = Table(summary_data, colWidths=[105, 105, 105, 104, 104])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 1, BORDER_COLOR),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 14))

    # 3. Course-by-Course Breakdown
    topics = Topic.objects.prefetch_related('units__quiz__completions__user').order_by('order', 'id')

    if not topics.exists():
        story.append(Paragraph("No course topics found in the LMS repository.", cell_style))
    else:
        for topic in topics:
            topic_units = topic.units.all()
            
            story.append(Paragraph(f"<b>Course {topic.order}: {topic.title}</b>", section_heading))

            if not topic_units.exists():
                story.append(Paragraph("<font color='#64748b'><i>No learning units uploaded for this course yet.</i></font>", cell_style))
                story.append(Spacer(1, 8))
                continue

            for unit in topic_units:
                quiz = getattr(unit, 'quiz', None)
                if not quiz:
                    story.append(Paragraph(f"<b>Module {unit.order}: {unit.title}</b> — <i>No quiz attached</i>", subsection_heading))
                    story.append(Spacer(1, 6))
                    continue

                completions = quiz.completions.all().select_related('user').order_by('-score', '-completed_at')
                c_count = completions.count()
                c_passed = sum(1 for c in completions if c.score >= 50.0)
                c_outstanding = sum(1 for c in completions if c.score >= 70.0)
                c_failed = c_count - c_passed
                c_avg = round(sum(c.score for c in completions) / c_count, 1) if c_count > 0 else 0.0

                unit_header_text = (
                    f"<b>Module {unit.order}: {unit.title}</b> &nbsp;|&nbsp; "
                    f"<font color='#ff6b1a'>Quiz: {quiz.title}</font> "
                    f"<font size=7.5 color='#475569'>({quiz.points_awarded} Pts Avail · Pass: 50% · Outstanding: 70%+)</font>"
                )
                story.append(Paragraph(unit_header_text, subsection_heading))

                stats_line = (
                    f"<font size=7.5 color='#475569'><b>Submissions:</b> {c_count} &nbsp;|&nbsp; "
                    f"<b>Passed:</b> <font color='#166534'>{c_passed}</font> ({c_outstanding} Outstanding) &nbsp;|&nbsp; "
                    f"<b>Failed:</b> <font color='#991b1b'>{c_failed}</font> &nbsp;|&nbsp; "
                    f"<b>Average Mark:</b> <b>{c_avg}%</b></font>"
                )
                story.append(Paragraph(stats_line, cell_style))
                story.append(Spacer(1, 4))

                table_rows = [
                    [
                        Paragraph("<b>#</b>", cell_header),
                        Paragraph("<b>Student Name</b>", cell_header),
                        Paragraph("<b>Email</b>", cell_header),
                        Paragraph("<b>Campus</b>", cell_header),
                        Paragraph("<b>Status</b>", cell_header),
                        Paragraph("<b>Score</b>", cell_header),
                        Paragraph("<b>Result</b>", cell_header),
                        Paragraph("<b>Points</b>", cell_header),
                        Paragraph("<b>Completed</b>", cell_header),
                    ]
                ]

                if c_count == 0:
                    table_rows.append([
                        Paragraph("—", cell_style),
                        Paragraph("<i>No students have completed this module yet.</i>", cell_style),
                        Paragraph("—", cell_style),
                        Paragraph("—", cell_style),
                        Paragraph("—", cell_style),
                        Paragraph("—", cell_style),
                        Paragraph("—", cell_style),
                        Paragraph("—", cell_style),
                        Paragraph("—", cell_style),
                    ])
                else:
                    for idx, comp in enumerate(completions, start=1):
                        stu = comp.user
                        full_name = f"{stu.first_name} {stu.last_name}".strip() or stu.email
                        campus = stu.get_campus_display() if hasattr(stu, 'get_campus_display') and stu.campus else (stu.campus or "—")
                        status_str = stu.get_volunteer_status_display() if hasattr(stu, 'get_volunteer_status_display') and stu.volunteer_status else (stu.volunteer_status or "—")
                        if "Senior" in status_str:
                            status_str = "Senior"
                        elif "Newcomer" in status_str:
                            status_str = "Newcomer"

                        if comp.score >= 70.0:
                            result_badge = Paragraph("<b>OUTSTANDING</b>", badge_outstanding)
                            score_style = badge_outstanding
                        elif comp.score >= 50.0:
                            result_badge = Paragraph("<b>PASS</b>", badge_pass)
                            score_style = badge_pass
                        else:
                            result_badge = Paragraph("<b>FAIL</b>", badge_fail)
                            score_style = badge_fail

                        table_rows.append([
                            Paragraph(str(idx), cell_style),
                            Paragraph(f"<b>{full_name}</b>", cell_style),
                            Paragraph(stu.email, cell_style),
                            Paragraph(campus, cell_style),
                            Paragraph(status_str, cell_style),
                            Paragraph(f"<b>{comp.score}%</b>", score_style),
                            result_badge,
                            Paragraph(f"+{comp.points_earned}", cell_style),
                            Paragraph(comp.completed_at.strftime("%d %b %Y"), cell_style),
                        ])

                unit_table = Table(table_rows, colWidths=[20, 105, 112, 42, 53, 42, 52, 40, 57])
                unit_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), DARK_NAVY),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
                    ('TOPPADDING', (0, 0), (-1, -1), 3.5),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
                    ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
                    ('ALIGN', (3, 0), (-1, -1), 'CENTER'),
                ]))

                story.append(unit_table)
                story.append(Spacer(1, 10))

    # 4. Coordinator Verification & Sign-off Block
    story.append(Spacer(1, 8))
    signoff_data = [
        [
            Paragraph("<b>Verified By (Coordinator):</b> ___________________________", meta_style),
            Paragraph("<b>Signature:</b> ___________________________", meta_style),
            Paragraph(f"<b>Audit Date:</b> {timezone.now().strftime('%d/%m/%Y')}", meta_style)
        ]
    ]
    signoff_table = Table(signoff_data, colWidths=[180, 180, 163])
    signoff_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(KeepTogether([signoff_table]))

    doc.build(story)
    return response

