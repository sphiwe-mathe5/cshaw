from rest_framework import serializers
from .models import Topic, LearningUnit, Quiz, Question, Choice, StudentProgress

class ChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Choice
        fields = ['id', 'text', 'is_correct']

class QuestionSerializer(serializers.ModelSerializer):
    choices = ChoiceSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = ['id', 'text', 'choices']

class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)
    completed = serializers.SerializerMethodField()
    user_score = serializers.SerializerMethodField()
    user_points = serializers.SerializerMethodField()
    user_passed = serializers.SerializerMethodField()
    total_questions = serializers.SerializerMethodField()
    correct_count = serializers.SerializerMethodField()
    incorrect_count = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = [
            'id', 'learning_unit', 'title', 'points_awarded', 'questions', 
            'completed', 'user_score', 'user_points', 'user_passed', 
            'total_questions', 'correct_count', 'incorrect_count'
        ]

    def get_completed(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return StudentProgress.objects.filter(user=request.user, quiz=obj).exists()
        return False

    def get_user_score(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            progress = StudentProgress.objects.filter(user=request.user, quiz=obj).first()
            if progress:
                return progress.score
        return None

    def get_user_points(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            progress = StudentProgress.objects.filter(user=request.user, quiz=obj).first()
            if progress:
                return progress.points_earned
        return 0

    def get_user_passed(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            progress = StudentProgress.objects.filter(user=request.user, quiz=obj).first()
            if progress:
                return progress.score >= 70.0
        return False

    def get_total_questions(self, obj):
        return obj.questions.count()

    def get_correct_count(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            progress = StudentProgress.objects.filter(user=request.user, quiz=obj).first()
            if progress:
                total = obj.questions.count()
                return round((progress.score / 100.0) * total)
        return None

    def get_incorrect_count(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            progress = StudentProgress.objects.filter(user=request.user, quiz=obj).first()
            if progress:
                total = obj.questions.count()
                correct = round((progress.score / 100.0) * total)
                return max(0, total - correct)
        return None

class LearningUnitSerializer(serializers.ModelSerializer):
    quiz = QuizSerializer(read_only=True)

    class Meta:
        model = LearningUnit
        fields = ['id', 'topic', 'title', 'content_text', 'order', 'quiz']

class TopicSerializer(serializers.ModelSerializer):
    units = LearningUnitSerializer(many=True, read_only=True)

    class Meta:
        model = Topic
        fields = ['id', 'title', 'order', 'units']

class StudentProgressSerializer(serializers.ModelSerializer):
    quiz_title = serializers.ReadOnlyField(source='quiz.title')
    topic_title = serializers.ReadOnlyField(source='quiz.learning_unit.topic.title')

    class Meta:
        model = StudentProgress
        fields = ['id', 'quiz', 'quiz_title', 'topic_title', 'score', 'points_earned', 'completed_at']
