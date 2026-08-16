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
    re_path(r'^quizzes/(?P<pk>\d+)/submit/?$', QuizViewSet.as_view({'post': 'submit'}), name='quiz-submit'),
    re_path(r'^admin/upload-nested/?$', AdminContentUploadView.as_view(), name='admin-upload-nested'),
    path('quiz-list/', QuizListView.as_view(), name='quiz-list'),
    path('', include(router.urls)),
]
