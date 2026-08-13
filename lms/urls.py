from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from .views import (
    TopicViewSet,
    LearningUnitViewSet,
    QuizViewSet,
    QuizListView,
    AdminContentUploadView
)

router = DefaultRouter()
router.register(r'topics', TopicViewSet, basename='topic')
router.register(r'units', LearningUnitViewSet, basename='learningunit')
router.register(r'quizzes', QuizViewSet, basename='quiz')

urlpatterns = [
    path('', include(router.urls)),
    path('quiz-list/', QuizListView.as_view(), name='quiz-list'),
    re_path(r'^admin/upload-nested/?$', AdminContentUploadView.as_view(), name='admin-upload-nested'),
]
