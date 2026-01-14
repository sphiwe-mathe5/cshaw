from django.urls import path
from . import views

urlpatterns = [

    path('', views.index_page, name='index'),
    path('about/', views.about_page, name='about'),
    path('privacy/', views.privacy, name='privacy'),
    path('terms/', views.terms, name='terms'),
    path('api/activities/', views.ActivityListView.as_view(), name='activity-list'),
    path('api/activities/create/', views.ActivityCreateView.as_view(), name='activity-create'),
    path('api/activities/<int:pk>/', views.ActivityDetailView.as_view(), name='activity-detail'),
    path('api/activities/signup/', views.SignupCreateView.as_view(), name='activity-signup'),
    path('api/activities/<int:activity_id>/rsvps/', views.EventRSVPListView.as_view(), name='event-rsvps'),
    path('api/attendance/<int:pk>/', views.AttendanceActionView.as_view(), name='attendance-action'),
    path('api/users/stats/', views.StudentStatsView.as_view(), name='student-stats'),
    path('api/activities/mine/', views.CoordinatorMyEventsView.as_view(), name='my-created-events'),
    path('api/activities/<int:pk>/signup/', views.SignupCreateView.as_view(), name='activity-signup'),
]