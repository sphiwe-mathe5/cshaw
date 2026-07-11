from django.db import models
from django.conf import settings

class Topic(models.Model):
    title = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.order}. {self.title}"

class LearningUnit(models.Model):
    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name='units')
    title = models.CharField(max_length=200)
    content_text = models.TextField(help_text="Supports HTML or Markdown formatting")
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.topic.title} - Unit {self.order}: {self.title}"

class Quiz(models.Model):
    learning_unit = models.OneToOneField(LearningUnit, on_delete=models.CASCADE, related_name='quiz')
    title = models.CharField(max_length=200)
    points_awarded = models.PositiveIntegerField(default=50, help_text="Points awarded upon successful completion")

    def __str__(self):
        return f"Quiz: {self.title} ({self.learning_unit.title})"

class Question(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='questions')
    text = models.TextField()

    def __str__(self):
        return f"{self.quiz.title} - Question: {self.text[:50]}"

class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='choices')
    text = models.CharField(max_length=255)
    is_correct = models.BooleanField(default=False)

    def __str__(self):
        return f"Choice for [{self.question.text[:30]}]: {self.text} ({'Correct' if self.is_correct else 'Incorrect'})"

class StudentProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='lms_progress')
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='completions')
    score = models.FloatField(help_text="Percentage score earned")
    points_earned = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'quiz')

    def __str__(self):
        return f"{self.user.email} -> {self.quiz.title} (Score: {self.score}%, Points: {self.points_earned})"
