"""URL configuration — everything the frontend needs lives under /api/."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
]
