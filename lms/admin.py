from django.contrib import admin
from .models import Topic, LearningUnit, Quiz, Question, Choice, StudentProgress

class LearningUnitInline(admin.TabularInline):
    model = LearningUnit
    extra = 1

@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ('order', 'title')
    search_fields = ('title',)
    inlines = [LearningUnitInline]

@admin.register(LearningUnit)
class LearningUnitAdmin(admin.ModelAdmin):
    list_display = ('title', 'topic', 'order')
    list_filter = ('topic',)
    search_fields = ('title', 'content_text')

class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 3

class QuestionInline(admin.StackedInline):
    model = Question
    extra = 1

@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ('title', 'learning_unit', 'points_awarded')
    list_filter = ('learning_unit__topic',)
    search_fields = ('title',)
    inlines = [QuestionInline]

@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('text', 'quiz')
    list_filter = ('quiz',)
    search_fields = ('text',)
    inlines = [ChoiceInline]

@admin.register(Choice)
class ChoiceAdmin(admin.ModelAdmin):
    list_display = ('text', 'question', 'is_correct')
    list_filter = ('is_correct', 'question__quiz')
    search_fields = ('text',)

@admin.register(StudentProgress)
class StudentProgressAdmin(admin.ModelAdmin):
    list_display = ('user', 'quiz', 'score', 'points_earned', 'completed_at')
    list_filter = ('quiz', 'completed_at')
    search_fields = ('user__email', 'user__first_name', 'user__last_name')
