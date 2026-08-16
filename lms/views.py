from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.views.generic import TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin

from users.permissions import IsCoordinator
from .models import Topic, LearningUnit, Quiz, Question, Choice, StudentProgress
from .serializers import (
    TopicSerializer, LearningUnitSerializer, QuizSerializer, 
    QuestionSerializer, ChoiceSerializer, StudentProgressSerializer
)

class LMSPermissionMixin:
    """
    Mixin to routing permissions: Read-only for authenticated students, 
    full write access for coordinators.
    """
    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'submit']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsCoordinator()]

class TopicViewSet(LMSPermissionMixin, viewsets.ModelViewSet):
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer

class LearningUnitViewSet(LMSPermissionMixin, viewsets.ModelViewSet):
    queryset = LearningUnit.objects.all()
    serializer_class = LearningUnitSerializer

    def destroy(self, request, *args, **kwargs):
        unit = self.get_object()
        topic = unit.topic
        # The user requested that deleting a unit deletes everything, including the topic
        topic.delete() 
        return Response(status=status.HTTP_204_NO_CONTENT)

class QuizViewSet(LMSPermissionMixin, viewsets.ModelViewSet):
    queryset = Quiz.objects.all()
    serializer_class = QuizSerializer

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
        passed = score_percent >= 70.0  # 70% passing threshold
        points_earned = quiz.points_awarded if passed else 0

        # Save student progress
        with transaction.atomic():
            # Check if this student already passed this quiz
            already_passed = StudentProgress.objects.filter(user=user, quiz=quiz, score__gte=70.0).exists()

            progress, created = StudentProgress.objects.get_or_create(
                user=user,
                quiz=quiz,
                defaults={'score': score_percent, 'points_earned': points_earned}
            )

            # Update score and points if score is higher or first time passing
            if not created:
                if score_percent > progress.score:
                    progress.score = score_percent
                    # If they hadn't passed before but passed now, award points
                    if passed and not already_passed:
                        progress.points_earned = quiz.points_awarded
                    progress.save()

            # Award points to the user's profile if passed and not awarded yet
            points_added = 0
            if passed and not already_passed:
                user.points += quiz.points_awarded
                user.save()
                points_added = quiz.points_awarded

        return Response({
            "score": score_percent,
            "passed": passed,
            "correct_count": correct_count,
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
                print(f"⚠️ LMS Email Notification Error: {email_err}")

            return Response({
                "message": "Course content published successfully!",
                "topic_id": topic.id,
                "unit_id": learning_unit.id,
                "quiz_id": quiz.id
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
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

