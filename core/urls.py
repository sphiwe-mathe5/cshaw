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
    path('api/activities/executive-list/', views.ExecutiveCampusEventsView.as_view(), name='executive-campus-events'),
    path('api/activities/<int:pk>/bulk_signout/', views.bulk_signout_view, name='bulk-signout'),
    path('api/reports/event/<int:pk>/', views.event_report_view, name='event-report'),
    path('api/reports/quarterly/', views.quarterly_report_view, name='quarterly-report'),
    path('api/reports/event/<int:pk>/download/', views.download_report_pdf, name='report-download'),
    path('api/reports/event/<int:pk>/email/', views.email_report_pdf, name='report-email'),
    path('api/reports/quarterly/download/', views.download_quarterly_pdf, name='quarterly-download'),
    path('api/reports/quarterly/email/', views.email_quarterly_pdf, name='quarterly-email'),
]