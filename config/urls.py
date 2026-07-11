from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from lms.views import LMSFrontendView

urlpatterns = [
    path('admin-cshaw-as/', admin.site.urls),
    path('', include('users.urls')),
    path('', include('core.urls')),
    path('api/lms/', include('lms.urls')),
    path('learning-hub/', LMSFrontendView.as_view(), name='learning-hub'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)