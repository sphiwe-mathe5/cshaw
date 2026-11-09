import logging
from django.contrib import messages
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.urls import reverse_lazy
from rest_framework import generics, permissions
from core.forms import FeedbackForm
from .models import CareerToolkitAsset, VolunteerActivity, ActivityRole, ActivitySignup, Feedback
from .audit import log_audit_event

logger = logging.getLogger('core')
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status, views
from rest_framework.decorators import api_view, permission_classes
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied
from .serializers import VolunteerActivitySerializer, ActivitySignupSerializer, ActivityRSVPSerializer, ActivitySerializer, FeedbackSerializer
from users.permissions import IsCoordinator, IsAuthorizedExecutiveOrCoordinator 
from django.db.models.functions import ExtractMonth, ExtractYear
import calendar
from django.db.models import Sum, Count, F, Case, When, Value, IntegerField
from datetime import date, timedelta, datetime
from users.services import BackgroundEmailService, send_new_event_email, send_signup_confirmation_email , send_series_event_email
from django.db.models import Q
from .reports import get_event_stats, get_comparative_stats, get_or_create_ai_insight, get_detailed_quarterly_stats, get_annual_report_data
from django.db.models.functions import TruncQuarter
from .utils import render_to_pdf
from django.core.mail import EmailMessage
from django.conf import settings
from django.http import HttpResponse
from django.core.mail import EmailMultiAlternatives, get_connection
from users.models import User, VolunteerBadge
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.views.generic import CreateView, CreateView, TemplateView
import json
import os
import csv
from openai import OpenAI
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.views import View
from django.views.generic import TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
import urllib.request
import urllib.parse
from django.core.cache import cache
from django.db.models import Sum, F, Q, DecimalField
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from datetime import timedelta


def index_page(request):
    event_hours_dict = ActivitySignup.objects.filter(attended=True).aggregate(Sum('hours_earned'))
    event_hours = event_hours_dict['hours_earned__sum'] or 0.0

    manual_hours_dict = User.objects.filter(role=User.Roles.STUDENT).aggregate(Sum('manual_bonus_hours'))
    manual_hours = manual_hours_dict['manual_bonus_hours__sum'] or 0.0

    global_total_hours = float(event_hours) + float(manual_hours)

    context = {

        'global_total_hours': int(global_total_hours) 
    }
    
    return render(request, 'core/index.html', context)

def about_page(request):
    return render(request, 'core/about.html')

def privacy(request):
    return render(request, 'core/privacy.html')

def terms(request):
    return render(request, 'core/terms.html')


class ActivityListView(generics.ListAPIView):
    serializer_class = VolunteerActivitySerializer
    permission_classes = [permissions.AllowAny] 

    def get_queryset(self):
        user = self.request.user
        # Default: Get all events, but exclude manual hours dummy events
        queryset = VolunteerActivity.objects.exclude(description="Manual hours allocation event").order_by('-date_time')
        # 1. Visitor (Not logged in) -> See ALL
        if not user.is_authenticated:
            return queryset
        # 2. Coordinator or Superuser -> See ALL
        # We explicitly check if the role is 'COORDINATOR'
        if user.is_superuser or user.role == 'COORDINATOR':
            return queryset
        # 3. Student / Executive -> Filter by Campus
        # Only apply filter if they are NOT a coordinator
        if getattr(user, 'campus', None):
            queryset = queryset.filter(
                Q(campus=user.campus) | Q(campus='ALL')
            )
            
        return queryset

class ActivityCreateView(generics.CreateAPIView):
    queryset = VolunteerActivity.objects.all()
    serializer_class = VolunteerActivitySerializer 
    permission_classes = [IsCoordinator]

    def create(self, request, *args, **kwargs):
        """
        Overridden create method to handle:
        1. Single Day: combining 'date_only' + 'start_time'
        2. Multi-Day: looping through a date range
        """
        # 1. Grab the specific fields sent by our updated Frontend
        is_multi = request.data.get('is_multi_day') == 'true'
        start_time_str = request.data.get('start_time') # e.g. "09:00"
        duration = request.data.get('duration_hours')   # e.g. "5.5"

        # Basic Validation
        if not start_time_str or not duration:
            return Response(
                {"error": "Start time and duration are required."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        if is_multi:
            return self.create_multi_day_series(request, start_time_str, duration)
        
        # --- SINGLE DAY LOGIC ---
        try:
            date_str = request.data.get('date_only') # e.g. "2026-03-10"
            if not date_str:
                return Response({"error": "Event date is required."}, status=status.HTTP_400_BAD_REQUEST)

            # Combine Date string and Time string into ISO format
            # Result: "2026-03-10T09:00"
            full_datetime = f"{date_str}T{start_time_str}"
            
            # Prepare data for serializer
            data = request.data.copy()
            data['date_time'] = full_datetime
            data['duration_hours'] = duration
            
            # Remove helper fields so they don't confuse the serializer
            # (Optional, but cleaner)
            if 'date_only' in data: del data['date_only']
            if 'start_time' in data: del data['start_time']

            # Validate and Save
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


    def create_multi_day_series(self, request, start_time_str, duration):
        """
        Custom logic to loop through a date range and create multiple events.
        """
        try:
            start_date_str = request.data.get('start_date')
            end_date_str = request.data.get('end_date')

            if not start_date_str or not end_date_str:
                 return Response({"error": "Date range is required for series."}, status=status.HTTP_400_BAD_REQUEST)

            start_date = date.fromisoformat(start_date_str)
            end_date = date.fromisoformat(end_date_str)
            
            delta = end_date - start_date
            
            created_events_data = [] # For the API response
            saved_activities = []    # For the Email function

            for i in range(delta.days + 1):
                current_day = start_date + timedelta(days=i)
                full_datetime = f"{current_day}T{start_time_str}"

                data = request.data.copy()
                
                original_title = request.data.get('title')
                data['title'] = f"{original_title} (Day {i+1})"
                
                data['date_time'] = full_datetime
                data['duration_hours'] = duration

                if 'start_date' in data: del data['start_date']
                if 'end_date' in data: del data['end_date']

                serializer = self.get_serializer(data=data)
                serializer.is_valid(raise_exception=True)
                activity = serializer.save(created_by=request.user)
                
                # ❌ REMOVED: send_new_event_email(activity) from here
                
                saved_activities.append(activity)
                created_events_data.append(serializer.data)

                log_audit_event(
                    action="EVENT_CREATED",
                    actor=request.user,
                    target_type="VolunteerActivity",
                    target_id=activity.id,
                    metadata={"title": activity.title, "campus": activity.campus, "is_series": True}
                )

            # ✅ ADDED: Send ONE email for the entire series after the loop finishes
            if saved_activities:
                # You will need to import this new function at the top of your views.py
                send_series_event_email(saved_activities, original_title) 

            logger.info("Multi-day event series created: %s (%d days) by %s", original_title, len(saved_activities), request.user.email)
            return Response(created_events_data, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error("Error creating event series: %s", e, exc_info=True)
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def perform_create(self, serializer):
        # Standard save hook
        activity = serializer.save(created_by=self.request.user)
        log_audit_event(
            action="EVENT_CREATED",
            actor=self.request.user,
            target_type="VolunteerActivity",
            target_id=activity.id,
            metadata={"title": activity.title, "campus": activity.campus, "is_series": False}
        )
        logger.info("Event created: %s (ID: %s) by %s", activity.title, activity.id, self.request.user.email)
        # Assuming you have this function imported or defined in utils.py
        send_new_event_email(activity)
    

class ActivityDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = VolunteerActivity.objects.all()
    serializer_class = VolunteerActivitySerializer
    permission_classes = [IsAuthorizedExecutiveOrCoordinator]

    def get_queryset(self):
        """
        Allow retrieval of ALL activities so Executives can see details for attendance.
        Restrict editing/deleting based on permissions later.
        """
        # FIX: Remove the .filter(created_by=...)
        return VolunteerActivity.objects.all()

    def perform_destroy(self, instance):
        # Optional: Extra check to ensure only Coordinators can delete
        if self.request.user.role != 'COORDINATOR':
             raise PermissionDenied("Only Coordinators can delete events.")

        log_audit_event(
            action="EVENT_DELETED",
            actor=self.request.user,
            target_type="VolunteerActivity",
            target_id=instance.id,
            metadata={"title": instance.title, "campus": instance.campus}
        )
        logger.info("Event deleted: %s (ID: %s) by %s", instance.title, instance.id, self.request.user.email)
        instance.delete()


class SignupCreateView(generics.CreateAPIView):
    serializer_class = ActivitySignupSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        user = self.request.user
        activity_id = self.request.data.get('activity')
        role_ids = self.request.data.get('selected_roles', [])
        activity = get_object_or_404(VolunteerActivity, pk=activity_id)

        # 1. Campus Check (Unchanged)
        if activity.campus != 'ALL' and activity.campus != user.campus:
            raise ValidationError(
                f"You cannot RSVP for {activity.campus} events. You are registered at {user.campus}."
            )
        
        # 2. Duplicate Check (Unchanged)
        if ActivitySignup.objects.filter(user=user, activity_id=activity_id).exists():
            raise ValidationError("You have already signed up for this event.")
        
        # 3. UPDATED: Capacity Check
        # Only check if full IF total_spots is set (not None)
        if activity.total_spots is not None and activity.spots_taken >= activity.total_spots:
            raise ValidationError("Sorry, this event is fully booked.")
        
        # 4. Save Signup
        signup_instance = serializer.save(user=user)

        if role_ids:
            valid_roles = activity.roles.filter(id__in=role_ids)
            signup_instance.roles.set(valid_roles)

        # 5. Update Counter
        activity.spots_taken += 1
        activity.save()

        send_signup_confirmation_email(user, activity)

    def delete(self, request, pk):

        activity = get_object_or_404(VolunteerActivity, pk=pk)
        user = request.user

        if activity.date_time.date() <= timezone.now().date():
            return Response(
                {"error": "Cancellations are not allowed on the day of the event or for past events."},
                status=status.HTTP_400_BAD_REQUEST
            )

        signup = ActivitySignup.objects.filter(activity=activity, user=user).first()

        if not signup:
            return Response(
                {"error": "You are not signed up for this event."},
                status=status.HTTP_404_NOT_FOUND
            )

        signup.delete()

        if activity.spots_taken > 0:
            activity.spots_taken -= 1
            activity.save()

        return Response(
            {"message": "Sign up cancelled successfully."},
            status=status.HTTP_200_OK
        )

class AttendanceActionView(views.APIView):
    permission_classes = [IsAuthorizedExecutiveOrCoordinator]

    def post(self, request, pk):
        action = request.data.get('action')
        manual_time_str = request.data.get('manual_time')

        try:
            signup = ActivitySignup.objects.get(pk=pk)
        except ActivitySignup.DoesNotExist:
            return Response({"error": "Signup not found"}, status=status.HTTP_404_NOT_FOUND)
        
        # --- ACCOUNTABILITY CHECK ---
        if request.user == signup.user:  # (Check your model, might be signup.student)
            return Response(
                {"error": "Accountability Lock 🔒: You cannot sign yourself in or out. Please ask another Executive to log your attendance."},
                status=status.HTTP_403_FORBIDDEN
            )

        # --- PERMISSION CHECK ---
        if request.user.role == 'STUDENT':
            if signup.activity.campus != 'ALL' and signup.activity.campus != request.user.campus:
                return Response(
                    {"error": "You can only manage attendance for your own campus or 'All Campus' events."}, 
                    status=status.HTTP_403_FORBIDDEN)

        # --- TIME HANDLING ---
        # 1. Get current real-world time in SAST
        current_now = timezone.localtime(timezone.now())

        # 2. Get the Event Start and End Times (SAST)
        event_start_local = timezone.localtime(signup.activity.date_time)
        event_date = event_start_local.date()
        
        # Calculate event end time
        event_duration = signup.activity.duration_hours or 0
        event_end_local = event_start_local + timezone.timedelta(hours=float(event_duration))

        if manual_time_str:
            try:
                hour, minute = map(int, manual_time_str.split(':'))
                # Create the Action Time using the Event's Date + Manual Hours
                action_time = event_start_local.replace(hour=hour, minute=minute, second=0, microsecond=0)

                # 🚨 FIX 1: STRICT FUTURE CHECK (No more 5-minute buffer)
                if action_time > current_now:
                    return Response({
                        "error": f"Cannot log future time. The current time is {current_now.strftime('%H:%M')}."
                    }, status=status.HTTP_400_BAD_REQUEST)

            except ValueError:
                return Response({"error": "Invalid time format."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # "Instant" Button Click -> Just use Now
            action_time = current_now

        # --- 4. SIGN IN ---
        if action == 'signin':
            if signup.sign_in_time:
                return Response({"error": "Student already signed in."}, status=status.HTTP_400_BAD_REQUEST)

            if action_time.date() != event_date:
                return Response({"error": f"Date mismatch. Event is on {event_date.strftime('%d %B')}."}, status=status.HTTP_400_BAD_REQUEST)

            if action_time < event_start_local:
                return Response({"error": f"Cannot sign in before event starts at {event_start_local.strftime('%H:%M')}."}, status=status.HTTP_400_BAD_REQUEST)
            
            if action_time > event_end_local:
                return Response({"error": f"Cannot sign in after event ended at {event_end_local.strftime('%H:%M')}."}, status=status.HTTP_400_BAD_REQUEST)

            signup.sign_in_time = action_time
            signup.sign_in_facilitator = request.user
            signup.save()

            return Response({"message": "Signed In", "time": signup.sign_in_time})

        # --- 5. SIGN OUT ---
        elif action == 'signout':
            if not signup.sign_in_time:
                return Response({"error": "Cannot sign out. Student never signed in."}, status=status.HTTP_400_BAD_REQUEST)

            if signup.sign_out_time:
                return Response({"error": "Student already signed out."}, status=status.HTTP_400_BAD_REQUEST)

            # 🚨 FIX 2: AUTO-CAP LATE SIGN-OUTS TO EVENT END TIME
            # If it's 22:30 but the event ended at 22:24, we quietly snap the time back to 22:24.
            if action_time > event_end_local:
                action_time = event_end_local

            # Check if this new capped time overlaps with their sign in
            if action_time <= signup.sign_in_time:
                return Response({"error": "Sign-out time cannot be before or equal to Sign-in time."}, status=status.HTTP_400_BAD_REQUEST)

            # Record the audited time
            signup.sign_out_time = action_time

            # --- STRICT TIME BOUNDING CALCULATION ---
            effective_sign_in = max(signup.sign_in_time, event_start_local)
            
            # We don't need min() here anymore because we already capped action_time above!
            duration = signup.sign_out_time - effective_sign_in
            actual_hours = max(0.0, duration.total_seconds() / 3600)

            max_allowed = float(signup.activity.duration_hours or 0)
            
            # 🚨 FIX: Track this specific session chunk
            session_data = {
                "in": effective_sign_in.isoformat(),
                "out": signup.sign_out_time.isoformat(),
                "hours": round(actual_hours, 2)
            }
            if not isinstance(signup.session_history, list):
                signup.session_history = []
            signup.session_history.append(session_data)
            
            # Add to total accumulated hours
            new_total = float(signup.hours_earned) + actual_hours

            signup.hours_earned = round(new_total, 2)
            signup.sign_out_facilitator = request.user
            signup.attended = True
            signup.save()

            log_audit_event(
                action="ATTENDANCE_VERIFIED",
                actor=request.user,
                target_type="ActivitySignup",
                target_id=signup.id,
                metadata={
                    "student_email": signup.user.email,
                    "activity_title": signup.activity.title,
                    "activity_id": signup.activity.id,
                    "hours_earned": float(signup.hours_earned),
                    "sign_in_time": signup.sign_in_time.isoformat() if signup.sign_in_time else None,
                    "sign_out_time": signup.sign_out_time.isoformat() if signup.sign_out_time else None,
                }
            )
            logger.info("Attendance verified for %s at '%s' (Earned: %sh, Verified by: %s)", signup.user.email, signup.activity.title, signup.hours_earned, request.user.email)

            return Response({
                "message": "Signed Out",
                "time": signup.sign_out_time,
                "hours": signup.hours_earned
            })

        # --- 6. RE-SIGN IN ---
        elif action == 'resignin':
            if not signup.sign_out_time:
                return Response({"error": "Student must be signed out first before re-signing in."}, status=status.HTTP_400_BAD_REQUEST)

            if action_time < event_start_local or action_time > event_end_local:
                return Response({"error": "Cannot re-sign in outside of official event hours."}, status=status.HTTP_400_BAD_REQUEST)

            if action_time <= signup.sign_out_time:
                return Response({"error": "Re-sign in time must be after their last sign-out time."}, status=status.HTTP_400_BAD_REQUEST)

            signup.sign_in_time = action_time
            signup.sign_out_time = None  # Resets them to "In Progress"
            signup.save()

            return Response({"message": "Re-Signed In", "time": signup.sign_in_time})

        return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
    
@api_view(['POST'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def bulk_signout_view(request, pk):
    """
    Signs out ALL currently signed-in students at the official Event End Time.
    """
    try:
        activity = VolunteerActivity.objects.get(pk=pk)
    except VolunteerActivity.DoesNotExist:
        return Response({"error": "Activity not found"}, status=status.HTTP_404_NOT_FOUND)

    # 1. Calculate the Official End Time (Start + Duration)
    if not activity.duration_hours:
         return Response({"error": "Cannot auto-sign out: No duration set for this activity."}, status=status.HTTP_400_BAD_REQUEST)

    end_time = activity.date_time + timedelta(hours=float(activity.duration_hours))

    # 2. Find students who are "In Progress" (Signed In but NOT Signed Out)
    pending_signups = ActivitySignup.objects.filter(
        activity=activity,
        sign_in_time__isnull=False,
        sign_out_time__isnull=True
    )

    if not pending_signups.exists():
        return Response({"message": "No pending students to sign out."})

    count = 0
    for signup in pending_signups:
        # A. Set time to Official End Time (Not "Now")
        signup.sign_out_time = end_time
        
        # B. Calculate Hours
        # --- STRICT TIME BOUNDING CALCULATION ---
        effective_sign_in = max(signup.sign_in_time, activity.date_time)
        
        duration = signup.sign_out_time - effective_sign_in
        actual_hours = max(0.0, duration.total_seconds() / 3600)
        
        # 🚨 FIX: Track this specific session chunk
        session_data = {
            "in": effective_sign_in.isoformat(),
            "out": signup.sign_out_time.isoformat(),
            "hours": round(actual_hours, 2)
        }
        if not isinstance(signup.session_history, list):
            signup.session_history = []
        signup.session_history.append(session_data)
        
        # Add to total accumulated hours (DO NOT OVERWRITE!)
        new_total = float(signup.hours_earned) + actual_hours
        
        signup.hours_earned = round(new_total, 2)
        signup.sign_out_facilitator = request.user
        signup.attended = True
        signup.save()
        count += 1

    log_audit_event(
        action="BULK_ATTENDANCE_VERIFIED",
        actor=request.user,
        target_type="VolunteerActivity",
        target_id=activity.id,
        metadata={"activity_title": activity.title, "students_signed_out_count": count}
    )
    logger.info("Bulk sign-out completed for activity '%s' (%d students) by %s", activity.title, count, request.user.email)

    return Response({"message": f"Successfully signed out {count} students."})

@api_view(['GET'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def export_rsvps_csv(request, pk):
    try:
        activity = VolunteerActivity.objects.get(pk=pk)
    except VolunteerActivity.DoesNotExist:
        return Response({"error": "Activity not found"}, status=status.HTTP_404_NOT_FOUND)
        
    signups = ActivitySignup.objects.filter(activity=activity).select_related('user')
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="rsvps_{activity.id}.csv"'
    
    writer = csv.writer(response)
    writer.writerow(['First Name', 'Last Name', 'Email', 'Campus', 'Status', 'Total Hours'])
    
    for s in signups:
        status_text = 'Attended' if s.attended else 'RSVPed'
        writer.writerow([
            s.user.first_name, 
            s.user.last_name, 
            s.user.email or '', 
            s.user.campus or '',
            status_text,
            s.hours_earned
        ])
        
    return response

class ExecutiveCampusEventsView(generics.ListAPIView):
    serializer_class = VolunteerActivitySerializer
    permission_classes = [IsAuthorizedExecutiveOrCoordinator]

    def get_queryset(self):
        user = self.request.user
        
        # 🛑 THE FIX: Coordinators (and Superusers) see absolutely everything 🛑
        if getattr(user, 'role', '') == 'COORDINATOR' or user.is_superuser:
            return VolunteerActivity.objects.all().order_by('date_time')
        
        # Executives only see their campus + 'ALL'
        user_campus = getattr(user, 'campus', None)
        return VolunteerActivity.objects.filter(
            Q(campus=user_campus) | Q(campus='ALL')
        ).order_by('date_time')
    
class EventRSVPListView(generics.ListAPIView):
    serializer_class = ActivityRSVPSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        activity_id = self.kwargs['activity_id']
        return ActivitySignup.objects.filter(activity_id=activity_id).select_related('user', 'activity').prefetch_related('roles') 
        

class CoordinatorMyEventsView(generics.ListAPIView):
    serializer_class = ActivitySerializer
    permission_classes = [permissions.IsAuthenticated, IsCoordinator]

    def get_queryset(self):
        return VolunteerActivity.objects.exclude(description="Manual hours allocation event").order_by('-date_time')

class StudentStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        TARGET_HOURS = 80.00
        current_year = timezone.now().year 
        
        stats = ActivitySignup.objects.filter(
            user=user, 
            attended=True, 
            sign_out_time__year=current_year 
        ).aggregate(
            total_hours=Sum('hours_earned'),
            total_events=Count('id')
        )
        
        # --- TOTAL HOURS CALCULATION ---
        activity_hours = float(stats['total_hours'] or 0.00)
        bonus_hours = float(getattr(user, 'manual_bonus_hours', 0.00)) 
        total_hours = activity_hours + bonus_hours 
        
        events_count = stats['total_events'] or 0
        remaining = round(max(0, TARGET_HOURS - total_hours), 2)
        progress_percent = round(min(100, (total_hours / TARGET_HOURS) * 100), 1)
        
        # --- MOTIVATION LOGIC ---
        if total_hours >= 80:
            motivation = "👑 GOAT STATUS! 80+ hours? You really left no crumbs. Absolute legend."
        elif total_hours >= 70:
            motivation = "🔥 70 Hours? You're eating this up. Final stretch, champ!"
        elif total_hours >= 60:
            motivation = "💅 60 Hours done. Highkey impressive."
        elif total_hours >= 50:
            motivation = "✨ 50 Hours! You have officially entered your Volunteer Era."
        elif total_hours >= 40:
            motivation = "🔋 Halfway Point! 40 hours locked in. Main character energy."
        elif total_hours >= 30:
            motivation = "🫡 30 Hours deep. The dedication is real. We see you!"
        elif total_hours >= 20:
            motivation = "👨‍🍳 20 Hours? Okay, hold up... you are cooking!"
        elif total_hours >= 10:
            motivation = "⚡ Double digits (10h)! Huge W. Keep that momentum going."
        elif total_hours > 0:
            motivation = "👀 You started! The first hour is always the hardest. Let's get this bread."
        else:
            motivation = f"👋 Welcome to {current_year}! New year, new grind. Let's get it."

        recruits_count = user.recruits.count()
        
        # 1. Get all students
        # (Assuming your User model is imported. Adjust import if needed)
        from users.models import User, VolunteerBadge 
        all_students = User.objects.filter(role=User.Roles.STUDENT)
        
        # 2. Start a dictionary with EVERY student's bonus hours
        peer_totals = {u.id: float(u.manual_bonus_hours or 0.0) for u in all_students}
        
        # 3. Add their actual activity hours for the current year
        yearly_activity = ActivitySignup.objects.filter(
            attended=True,
            sign_out_time__year=current_year,
            user__role=User.Roles.STUDENT
        ).values('user').annotate(
            hours=Sum('hours_earned')
        )
        
        for item in yearly_activity:
            uid = item['user']
            if uid in peer_totals:
                peer_totals[uid] += float(item['hours'] or 0.0)
                
        # 4. Calculate Global Rank (Compare against ALL students)
        global_rank = 1
        for uid, peer_hours in peer_totals.items():
            if peer_hours > total_hours and uid != user.id:
                global_rank += 1
                
        # 5. Calculate Campus Rank (Compare ONLY against their campus)
        campus_rank = 1
        campus_student_ids = set(all_students.filter(campus=user.campus).values_list('id', flat=True))
        for uid, peer_hours in peer_totals.items():
            if uid in campus_student_ids and peer_hours > total_hours and uid != user.id:
                campus_rank += 1
                
        
        punctuality_data = ActivitySignup.objects.filter(
            user=user, 
            attended=True, 
            sign_out_time__year=current_year,
            sign_in_time__isnull=False # Ensure they actually signed in
        ).annotate(
            is_early=Case(
                When(sign_in_time__lte=F('activity__date_time'), then=Value(1)),
                default=Value(0),
                output_field=IntegerField()
            ),
            is_late=Case(
                When(sign_in_time__gt=F('activity__date_time'), then=Value(1)),
                default=Value(0),
                output_field=IntegerField()
            )
        ).aggregate(
            early_total=Sum('is_early'),
            late_total=Sum('is_late')
        )

        early_count = punctuality_data['early_total'] or 0
        late_count = punctuality_data['late_total'] or 0


        if early_count > late_count:
            punctuality_status = "Usually Early"
            punc_color = "#10B981" # Success Green
            punc_bg = "rgba(16, 185, 129, 0.15)"
        elif late_count > early_count:
            punctuality_status = "Usually Late"
            punc_color = "#ef4444" # Danger Red
            punc_bg = "rgba(239, 68, 68, 0.15)"
        elif early_count == late_count and early_count > 0:
            punctuality_status = "Perfectly Even"
            punc_color = "#f59e0b" # Warning Orange
            punc_bg = "rgba(245, 158, 11, 0.15)"
        else:
            punctuality_status = "No Data Yet"
            punc_color = "#64748b" # Muted Slate
            punc_bg = "rgba(100, 116, 139, 0.15)"

        # --- FORMAT MONTHLY DATA ---
        monthly_data = ActivitySignup.objects.filter(
            user=user, 
            attended=True,
            sign_out_time__year=current_year 
        ).annotate(
            month=ExtractMonth('sign_out_time')
        ).values('month').annotate(
            hours=Sum('hours_earned')
        ).order_by('-month')

        formatted_months = []
        for item in monthly_data:
            month_name = calendar.month_name[item['month']]
            formatted_months.append({
                'name': month_name,
                'hours': item['hours']
            })

        user_awards = user.awards.all()
        awards_data = [{'name': a.name, 'icon': a.icon, 'color': a.color, 'description': a.description, 'date_awarded': a.date_awarded} for a in user_awards]
        
        # --- BADGES LOGIC ---
        if total_hours >= 40:
            VolunteerBadge.objects.get_or_create(user=user, badge_type='40_hours')
        if total_hours >= 80:
            VolunteerBadge.objects.get_or_create(user=user, badge_type='80_hours')
            
        user_badges = VolunteerBadge.objects.filter(user=user)
        badges_data = [{'type': b.badge_type, 'date_earned': b.date_earned.strftime("%b %d, %Y")} for b in user_badges]
        
        # --- LEARNING ACCOLADES LOGIC ---
        from lms.models import StudentProgress
        accolades = StudentProgress.objects.filter(user=user, score=100.0).select_related('quiz')
        learning_accolades = [
            {
                'quiz_title': acc.quiz.title,
                'date_completed': acc.completed_at.strftime("%b %d, %Y")
            } for acc in accolades
        ]
        
        recent_events = ActivitySignup.objects.filter(
            user=user, 
            attended=True,
            sign_out_time__year=current_year 
        ).order_by('-sign_out_time')
        
        events_list = [{
            'title': e.activity.title,
            'date': e.sign_out_time,
            'hours': e.hours_earned,
            'session_history': e.session_history
        } for e in recent_events]

        # --- YEAR-END COMPLETION & CERTIFICATE HOLDER STATUS ---
        from .models import CampTicket
        user_camp_ticket = CampTicket.objects.filter(
            user=user,
            status__in=['active', 'confirmed'],
            user__is_camp_eligible=True
        ).first()

        is_certificate_holder = bool(user_camp_ticket)
        is_completed = bool(total_hours >= TARGET_HOURS or is_certificate_holder)
        is_apb_champion = (user.campus == 'APB')

        return Response({
            "first_name": user.first_name,
            "last_name": user.last_name,
            "campus": user.campus,  
            "is_executive": bool(user.executive_position),
            "current_year": current_year, 
            "total_hours": total_hours,
            "activity_hours": activity_hours,
            "bonus_hours": bonus_hours,      
            "events_count": events_count,
            "recruits_count": recruits_count,
            "target": TARGET_HOURS,
            "remaining": remaining,
            "progress_percent": progress_percent,
            "motivation": motivation,
            "rank_global": global_rank,   # 👈 Returning new global rank
            "rank_campus": campus_rank,   # 👈 Returning new campus rank
            "monthly": formatted_months,
            "history": events_list,
            "awards": awards_data,
            "badges": badges_data,
            "learning_accolades": learning_accolades,
            "punctuality_status": punctuality_status,
            "punctuality_color": punc_color,
            "punctuality_bg": punc_bg,
            "early_count": early_count,
            "late_count": late_count,
            "executive_position": user.executive_position,
            "year_ended": True,
            "is_certificate_holder": is_certificate_holder,
            "is_completed": is_completed,
            "is_apb_champion": is_apb_champion,
            "camp_cohort_rank": user_camp_ticket.cohort_rank if user_camp_ticket else None,
            "camp_honor_title": user_camp_ticket.honor_title if user_camp_ticket else None,
        })
        

@api_view(['GET'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def event_report_view(request, pk):
    try:
        activity = VolunteerActivity.objects.get(pk=pk)
    except VolunteerActivity.DoesNotExist:
        return Response({"error": "Activity not found"}, status=404)

    # 1. Get Hard Numbers
    stats = get_event_stats(pk)
    comparison = get_comparative_stats(pk)
    
    # 2. Get AI Insight (Cached or New)
    ai_summary = get_or_create_ai_insight(activity, stats, comparison)
    
    return Response({
        "stats": stats,
        "comparison": comparison,
        "ai_analysis": ai_summary
    })

@api_view(['GET'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def quarterly_report_api_view(request):
    try:
        year = int(request.query_params.get('year', timezone.now().year))
    except (ValueError, TypeError):
        year = timezone.now().year
    
    annual_data = get_annual_report_data(year)
    return Response({
        "year": year,
        "data": annual_data['report_data'],
        "kpis": annual_data['kpis'],
        "campus_matrix": annual_data['campus_matrix'],
        "lms_stats": annual_data['lms_stats'],
        "honor_roll": annual_data['honor_roll'],
        "demographics": annual_data['demographics'],
        "feedback": annual_data['feedback']
    })


@api_view(['GET'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def download_report_pdf(request, pk):
    """
    Generates and downloads the PDF directly.
    """
    try:
        stats = get_event_stats(pk)
        comparison = get_comparative_stats(pk)
        activity = VolunteerActivity.objects.get(pk=pk)
        
        # Reuse the AI logic (fetch from DB or generate)
        ai_analysis = get_or_create_ai_insight(activity, stats, comparison)

        data = {
            'stats': stats,
            'comparison': comparison,
            'ai_analysis': ai_analysis
        }
        
        pdf = render_to_pdf('core/pdf_report.html', data)
        
        if pdf:
            response = HttpResponse(pdf, content_type='application/pdf')
            safe_title = str(stats.get('title', 'Event')).replace(' ', '_').replace('/', '_')
            response['Content-Disposition'] = f'attachment; filename="Report_{safe_title}.pdf"'
            return response
        logger.error("download_report_pdf: PDF rendering returned None for activity %s", pk)
        return HttpResponse("Unable to generate PDF report at this time.", status=500, content_type="text/plain")
    except Exception as e:
        logger.error("download_report_pdf exception for activity %s: %s", pk, e, exc_info=True)
        return HttpResponse(f"Error generating event report: {str(e)}", status=500, content_type="text/plain")

@api_view(['POST'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def email_report_pdf(request, pk):
    """
    Generates PDF and emails it to a list of recipients.
    Expects JSON: { "emails": "a@b.com, c@d.com" }
    """
    emails_raw = request.data.get('emails', '')
    if not emails_raw:
        return Response({"error": "No email addresses provided."}, status=400)

    # Clean email list
    recipient_list = [e.strip() for e in emails_raw.split(',') if e.strip()]

    try:
        # Generate Data & PDF
        stats = get_event_stats(pk)
        comparison = get_comparative_stats(pk)
        activity = VolunteerActivity.objects.get(pk=pk)
        ai_analysis = get_or_create_ai_insight(activity, stats, comparison)

        data = {'stats': stats, 'comparison': comparison, 'ai_analysis': ai_analysis}
        pdf = render_to_pdf('core/pdf_report.html', data)

        if not pdf:
            return Response({"error": "PDF Generation Failed"}, status=500)

        # Send Email
        subject = f"Event Report: {stats['title']}"
        message = f"Please find attached the performance report for the event '{stats['title']}' held on {stats['date']}."
        email = EmailMessage(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            recipient_list
        )
        safe_title = str(stats.get('title', 'Event')).replace(' ', '_').replace('/', '_')
        email.attach(f"Report_{safe_title}.pdf", pdf, 'application/pdf')
        email.send()
        
        return Response({"message": f"Report sent to {len(recipient_list)} recipients."})
    except Exception as e:
        logger.error("Email Error sending report for activity %s: %s", pk, e, exc_info=True)
        return Response({"error": f"Failed to send email: {str(e)}"}, status=500)
    
@api_view(['GET'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def download_quarterly_pdf(request):
    try:
        year = int(request.query_params.get('year', timezone.now().year))
    except (ValueError, TypeError):
        year = timezone.now().year

    try:
        data = get_annual_report_data(year)
        pdf = render_to_pdf('core/quarterly_pdf.html', data)
        
        if pdf:
            response = HttpResponse(pdf, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="Annual_Report_{year}.pdf"'
            return response
        
        logger.error("download_quarterly_pdf: PDF rendering returned None for year %s", year)
        return HttpResponse("Unable to generate PDF report at this time. Please contact the administrator.", status=500, content_type="text/plain")
    except Exception as e:
        logger.error("download_quarterly_pdf exception: %s", e, exc_info=True)
        return HttpResponse(f"Server error generating report: {str(e)}", status=500, content_type="text/plain")

@api_view(['POST'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def email_quarterly_pdf(request):
    try:
        year = int(request.data.get('year', timezone.now().year))
    except (ValueError, TypeError):
        year = timezone.now().year

    emails_raw = request.data.get('emails', '')
    if not emails_raw:
        return Response({"error": "No email addresses provided."}, status=400)

    recipient_list = [e.strip() for e in emails_raw.split(',') if e.strip()]

    try:
        data = get_annual_report_data(year)
        pdf = render_to_pdf('core/quarterly_pdf.html', data)

        if not pdf:
            return Response({"error": "PDF Generation Failed"}, status=500)

        subject = f"Annual Volunteer Report: {year}"
        message = f"Please find attached the quarterly breakdown and campus performance report for the year {year}."
        email = EmailMessage(subject, message, settings.DEFAULT_FROM_EMAIL, recipient_list)
        email.attach(f"Annual_Report_{year}.pdf", pdf, 'application/pdf')
        email.send()
        logger.info("Annual volunteer report for %s emailed to %d recipients by %s", year, len(recipient_list), request.user.email)
        return Response({"message": f"Yearly report sent to {len(recipient_list)} recipients."})
    except Exception as e:
        logger.error("Email Error sending quarterly report: %s", e, exc_info=True)
        return Response({"error": f"Failed to send email: {str(e)}"}, status=500)
    
class SendAnnouncementView(APIView):
    permission_classes = [IsAuthorizedExecutiveOrCoordinator] 

    def post(self, request):
        subject = request.data.get('subject')
        message = request.data.get('message')
        target_campus = request.data.get('campus', 'ALL')
        custom_emails_raw = request.data.get('custom_emails', '') 

        if not subject or not message:
            return Response({"error": "Subject and Message are required."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Select Recipients (DB Queries stay in the main thread)
        if target_campus == 'CUSTOM':
            if not custom_emails_raw.strip():
                return Response({"error": "No custom emails provided."}, status=status.HTTP_400_BAD_REQUEST)
            recipient_list = [email.strip() for email in custom_emails_raw.split(',') if email.strip()]
            
        elif target_campus == 'ALL':
            recipient_list = list(User.objects.filter(is_active=True).values_list('email', flat=True))
        else:
            recipient_list = list(User.objects.filter(campus=target_campus, is_active=True).values_list('email', flat=True))
        
        if not recipient_list:
            return Response({"error": "No users found for this selection."}, status=status.HTTP_404_NOT_FOUND)

        # 2. Render HTML Email (Rendering stays in the main thread)
        html_content = render_to_string('core/announcement.html', {
            'subject': subject,
            'message': message
        })

        # 3. Offload the actual sending to the Background Thread!
        try:
            BackgroundEmailService._send_async(
                subject=f"[C-SHAW] {subject}",
                to_emails=[settings.DEFAULT_FROM_EMAIL], 
                html_content=html_content,
                bcc_emails=recipient_list 
            )

            log_audit_event(
                action="ANNOUNCEMENT_BROADCAST",
                actor=request.user,
                target_type="Announcement",
                target_id="",
                metadata={
                    "subject": subject,
                    "target_campus": target_campus,
                    "recipients_count": len(recipient_list)
                }
            )
            logger.info("Announcement '%s' queued to %d recipients by %s", subject, len(recipient_list), request.user.email)

            # Instantly return success to the frontend while emails send in the background
            return Response({"message": f"Announcement queued to send to {len(recipient_list)} recipient(s)."})

        except Exception as e:
            logger.error("Announcement Queue Error: %s", e, exc_info=True)
            return Response({"error": "Failed to queue emails."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        
class LeaderboardAPIView(APIView):
    # Only let coordinators and executives see the stats
    permission_classes = [IsAuthorizedExecutiveOrCoordinator] 

    def get(self, request):
        # 1. Grab all active students
        students = User.objects.filter(role=User.Roles.STUDENT, is_active=True)
        leaderboard_data = []

        # We will need some summary metrics for the header
        total_volunteers = students.count()
        total_calculated_hours = 0.0

        for student in students:
            # Grab all signups where the student actually attended
            attended_records = ActivitySignup.objects.filter(user=student, attended=True).select_related('activity')
            
            events_count = attended_records.count()
            on_time_count = 0
            late_count = 0
            calculated_hours = 0.0

            for record in attended_records:
                calculated_hours += float(record.hours_earned)
                
                if record.sign_in_time and record.activity.date_time:
                    grace_period = record.activity.date_time + timedelta(minutes=5)
                    if record.sign_in_time <= grace_period:
                        on_time_count += 1
                    else:
                        late_count += 1

            # 👇 FIXED: Add the manual bonus hours from your User model
            manual_bonus = float(getattr(student, 'manual_bonus_hours', 0.00))
            student_total_hours = calculated_hours + manual_bonus
            
            total_calculated_hours += student_total_hours

            # Format gender & ID / Passport number
            gender_val = student.get_gender_display() if hasattr(student, 'get_gender_display') and student.gender else (student.gender if student.gender else "Not provided")
            id_val = student.id_number if student.id_number else "Not provided"

            # 2. Package it up for the Javascript, adding the student's campus, gender, and ID
            leaderboard_data.append({
                'first_name': student.first_name,
                'last_name': student.last_name,
                'gender': gender_val,
                'id_number': id_val,
                'id_type': student.id_type if hasattr(student, 'id_type') else 'SA_ID',
                'campus': student.get_campus_display() if hasattr(student, 'get_campus_display') else "Unknown Campus",
                'total_hours': round(student_total_hours, 1),
                'events_attended': events_count,
                'on_time_count': on_time_count,
                'late_count': late_count,
            })
            
        # Add summary data to the payload
        response_data = {
            'summary': {
                'volunteers': total_volunteers,
                'hours': round(total_calculated_hours, 1)
            },
            'rankings': leaderboard_data
        }

        return Response(response_data)    
        
class VideoGuidesView(TemplateView):
    template_name = 'core/video_guides.html' 

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        context['videos'] = [
            {
                'id': 1,
                'title': 'How to Register in the platform',
                # 👇 Paste your full Google Cloud URL here
                'url': 'https://storage.googleapis.com/cshaw/images/register.mp4', 
            },
            {
                'id': 2,
                'title': 'How to RSVP for Events',
                # 👇 Paste your full Google Cloud URL here
                'url': 'https://storage.googleapis.com/cshaw/images/rsvp.mp4',
            },
        ]
        return context

@permission_classes([IsCoordinator]) # Or your standard login decorators
def leaderboard_page_view(request):
    # Render a dedicated HTML template (we will create this in Step 3)
    return render(request, 'core/leaderboard_race.html')

# --- 2. THE DATA API VIEW ---
@api_view(['GET'])
@permission_classes([IsCoordinator])
def leaderboard_race_data(request):
    # 1. Fetch all regular event hours, chronologically
    signups = ActivitySignup.objects.filter(
        attended=True,
        hours_earned__gt=0
    ).select_related('user', 'activity').order_by('activity__date_time')

    # 2. Fetch users who have manual bonus hours to give them a "Head Start"
    users_with_bonus = User.objects.filter(manual_bonus_hours__gt=0)
    
    # Create our baseline dictionary
    baseline_totals = {}
    for u in users_with_bonus:
        name = f"{u.first_name} {u.last_name}".strip()
        if not name:
            name = getattr(u, 'username', 'Unknown')
        baseline_totals[name] = float(u.manual_bonus_hours)

    # If there is absolutely no data in the system at all
    if not signups.exists() and not users_with_bonus.exists():
        return Response([])

    # 3. Determine the start date of the race
    if signups.exists():
        start_date = signups.first().activity.date_time.date()
    else:
        # If no events exist yet, but someone has bonus hours, just start the timeline 7 days ago
        start_date = timezone.now().date() - timedelta(days=7)
        
    end_date = timezone.now().date()
    
    # 4. Copy the baseline bonus hours into the running totals
    user_totals = dict(baseline_totals)
    race_timeline = []

    signup_list = list(signups)
    idx = 0
    total_signups = len(signup_list)
    current_date = start_date

    # 5. Walk through history day by day
    while current_date <= end_date:
        
        # Add any event hours earned on or before this current timeline day
        while idx < total_signups and signup_list[idx].activity.date_time.date() <= current_date:
            signup = signup_list[idx]
            user = signup.user
            
            user_name = f"{user.first_name} {user.last_name}".strip()
            if not user_name:
                user_name = getattr(user, 'username', 'Unknown')

            # If they don't have bonus hours, they start at 0
            if user_name not in user_totals:
                user_totals[user_name] = 0.0
                
            user_totals[user_name] += float(signup.hours_earned)
            
            idx += 1 

        # Build the leaderboard for this specific day
        rankings = []
        for name, hours in user_totals.items():
            if hours > 0:
                rankings.append({"name": name, "hours": hours})

        # Sort so highest hours are at the top, and take the Top 10
        rankings.sort(key=lambda x: x['hours'], reverse=True)
        
        race_timeline.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "rankings": rankings[:10]
        })

        current_date += timedelta(days=1)

    return Response(race_timeline)

class StudentFeedbackView(LoginRequiredMixin, CreateView):
    model = Feedback
    form_class = FeedbackForm
    template_name = 'core/student_feedback.html'
    success_url = reverse_lazy('student-feedback') 

    def form_valid(self, form):
        messages.success(self.request, "Thank you! Your feedback has been securely submitted.")
        return super().form_valid(form)

    def form_invalid(self, form):

        if self.request.POST:
            messages.error(self.request, "There was an error with your submission. Please check your inputs.")
        return super().form_invalid(form)

class AdminFeedbackDashboard(UserPassesTestMixin, TemplateView):
    template_name = 'core/admin_feedback.html' 

    def test_func(self):
        return self.request.user.is_staff or getattr(self.request.user, 'role', '') in ['COORDINATOR']

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['feedbacks'] = Feedback.objects.all().order_by('-created_at')
        return context
    
def quarterly_report_page(request):
    now = timezone.now()

    # ==========================================
    # 1. BASE QUERY: THE "TRUE ACTIVE" STUDENTS
    # ==========================================
    # This creates a reusable list of students who have > 5 total combined hours.
    # We define it once here to make the rest of the code extremely fast.
    
    true_active_students = User.objects.filter(
        role=User.Roles.STUDENT,
        is_superuser=False
    ).annotate(
        # 1. Sum up all their physical sign-in hours (default to 0 if none)
        total_event_hours=Coalesce(
            Sum('activitysignup__hours_earned', filter=Q(activitysignup__attended=True)),
            0.0,
            output_field=DecimalField()
        )
    ).annotate(
        # 2. Add their manual bonus hours to their event hours
        grand_total=F('total_event_hours') + F('manual_bonus_hours')
    ).filter(
        # 3. Only keep students whose grand total is strictly greater than 5
        grand_total__gt=5
    )

    # ==========================================
    # 2. HERO METRICS
    # ==========================================
    total_registered = User.objects.filter(role=User.Roles.STUDENT, is_superuser=False).count()
    
    # We now just count that base query we built above!
    active_peers = true_active_students.count()

    # Hours calculation
    event_hours_dict = ActivitySignup.objects.filter(attended=True).aggregate(Sum('hours_earned'))
    event_hours = event_hours_dict['hours_earned__sum'] or 0.0

    manual_hours_dict = User.objects.filter(role=User.Roles.STUDENT).aggregate(Sum('manual_bonus_hours'))
    manual_hours = manual_hours_dict['manual_bonus_hours__sum'] or 0.0

    total_hours = float(event_hours) + float(manual_hours)
    total_events = VolunteerActivity.objects.filter(date_time__lte=now).count()

    # ==========================================
    # 3. CAMPUS BREAKDOWN DATA
    # ==========================================
    campuses = ['APB', 'DFC', 'APK', 'SWC']
    campus_context = {}

    for camp in campuses:
        # Total Registered at this campus
        total_pe_count = User.objects.filter(
            role=User.Roles.STUDENT,
            campus=camp,
            is_superuser=False
        ).count()

        # Active PEs at this campus (We just filter our base query by campus!)
        active_pe_count = true_active_students.filter(campus=camp).count()

        # Hours for this campus
        camp_event_hours_aggr = ActivitySignup.objects.filter(
            user__campus=camp, attended=True
        ).aggregate(Sum('hours_earned'))
        camp_event_hours = camp_event_hours_aggr['hours_earned__sum'] or 0.0

        camp_manual_hours_aggr = User.objects.filter(
            role=User.Roles.STUDENT, campus=camp
        ).aggregate(Sum('manual_bonus_hours'))
        camp_manual_hours = camp_manual_hours_aggr['manual_bonus_hours__sum'] or 0.0

        total_camp_hours = float(camp_event_hours) + float(camp_manual_hours)

        # Average hours (Calculated against the new >5 hours Active peers metric)
        avg_hours = (total_camp_hours / active_pe_count) if active_pe_count > 0 else 0.0

        # Save to context
        prefix = camp.lower()
        campus_context[f'{prefix}_total_count'] = total_pe_count
        campus_context[f'{prefix}_active_count'] = active_pe_count
        campus_context[f'{prefix}_total_hours'] = round(total_camp_hours, 1)
        campus_context[f'{prefix}_avg_hours'] = round(avg_hours, 1)
    # ==========================================
    # 3. ENGAGEMENT DATA (For the Charts)
    # ==========================================
    
    # Get ALL completed events, ordered oldest to newest
    all_past_events = VolunteerActivity.objects.filter(date_time__lte=now).order_by('date_time')
    
    turnout_labels = []
    expected_data = []
    actual_data = []

    for event in all_past_events: 
        turnout_labels.append(event.title)
        
        # 'Expected' = RSVPs
        total_rsvps = ActivitySignup.objects.filter(activity=event).count()
        expected_data.append(total_rsvps)
        
        # 'Actual' = Attended
        attended_count = ActivitySignup.objects.filter(activity=event, attended=True).count()
        actual_data.append(attended_count)

    # Overall attendance percentage
    all_time_rsvps = ActivitySignup.objects.count()
    all_time_attended = ActivitySignup.objects.filter(attended=True).count()
    attendance_rate = round((all_time_attended / all_time_rsvps) * 100) if all_time_rsvps > 0 else 0
    # ==========================================
    # 4. PUNCTUALITY METRICS
    # ==========================================
    late_count = ActivitySignup.objects.filter(
        attended=True,
        sign_in_time__isnull=False,
        sign_in_time__gt=F('activity__date_time')
    ).count()

    # 2. Calculate On Time: Total attended minus the late comers
    # (This safely gives the "benefit of the doubt" to anyone marked attended manually without a timestamp)
    total_attended = ActivitySignup.objects.filter(attended=True).count()
    on_time_count = total_attended - late_count

    # 3. Calculate No Shows: RSVP'd but never attended
    excused_count = ActivitySignup.objects.filter(attended=False).count() 

    # ==========================================
    # 5. FEEDBACK (Showing ALL feedback, no limits)
    # ==========================================
    all_feedbacks = Feedback.objects.select_related('user').order_by('-created_at')

    # ==========================================
    # 6. CONTEXT ASSEMBLY
    # ==========================================
    context = {
        'total_hours': round(total_hours, 1),
        'total_events': total_events,
        'total_registered': total_registered,
        'active_peers': active_peers,
        # Javascript Charts 
        'chart_labels': json.dumps(turnout_labels),
        'chart_expected': expected_data,
        'chart_actual': actual_data,
        
        'punctuality_on_time': on_time_count,
        'punctuality_late': late_count,
        'punctuality_excused': excused_count,
        
        'feedbacks': all_feedbacks,
        # Unpack all campus dictionary variables dynamically
        **campus_context, 
    }

    return render(request, 'core/quarterly_report.html', context)


def yearly_report_page(request):
    """
    Comprehensive Year-End Impact & Performance Report for C-SHAW Management.
    All metrics and data are dynamically derived from actual database records.
    """
    from .models import CampTicket, CareerToolkitAsset
    from lms.models import StudentProgress
    from django.db.models import Avg

    now = timezone.now()
    year = 2026

    # 1. Base query for active students (>5 total hours)
    true_active_students = User.objects.filter(
        role=User.Roles.STUDENT,
        is_superuser=False
    ).annotate(
        total_event_hours=Coalesce(
            Sum('activitysignup__hours_earned', filter=Q(activitysignup__attended=True)),
            0.0,
            output_field=DecimalField()
        )
    ).annotate(
        grand_total=F('total_event_hours') + F('manual_bonus_hours')
    ).filter(
        grand_total__gt=5
    )

    total_registered = User.objects.filter(role=User.Roles.STUDENT, is_superuser=False).count()
    active_peers = true_active_students.count()

    event_hours_dict = ActivitySignup.objects.filter(attended=True).aggregate(Sum('hours_earned'))
    event_hours = float(event_hours_dict['hours_earned__sum'] or 0.0)

    manual_hours_dict = User.objects.filter(role=User.Roles.STUDENT).aggregate(Sum('manual_bonus_hours'))
    manual_hours = float(manual_hours_dict['manual_bonus_hours__sum'] or 0.0)

    total_hours = round(event_hours + manual_hours, 1)
    total_events = VolunteerActivity.objects.filter(date_time__lte=now).count()

    # Campus Breakdown - dynamically queried from DB
    campuses_info = [
        ('APB', 'Auckland Park Bunting Road'),
        ('APK', 'Auckland Park Kingsway'),
        ('DFC', 'Doornfontein Campus'),
        ('SWC', 'Soweto Campus'),
    ]
    campus_list = []
    campus_context = {}

    for code, name in campuses_info:
        total_pe_count = User.objects.filter(
            role=User.Roles.STUDENT,
            campus=code,
            is_superuser=False
        ).count()

        active_pe_count = true_active_students.filter(campus=code).count()

        camp_event_hours = float(ActivitySignup.objects.filter(
            user__campus=code, attended=True
        ).aggregate(Sum('hours_earned'))['hours_earned__sum'] or 0.0)

        camp_manual_hours = float(User.objects.filter(
            role=User.Roles.STUDENT, campus=code
        ).aggregate(Sum('manual_bonus_hours'))['manual_bonus_hours__sum'] or 0.0)

        total_camp_hours = camp_event_hours + camp_manual_hours
        avg_hours = (total_camp_hours / active_pe_count) if active_pe_count > 0 else 0.0
        act_pct = round((active_pe_count / total_pe_count * 100), 1) if total_pe_count > 0 else 0.0

        item = {
            'code': code,
            'name': name,
            'total_count': total_pe_count,
            'active_count': active_pe_count,
            'active_pct': act_pct,
            'total_hours': round(total_camp_hours, 1),
            'avg_hours': round(avg_hours, 1),
        }
        campus_list.append(item)

        prefix = code.lower()
        campus_context[f'{prefix}_total_count'] = total_pe_count
        campus_context[f'{prefix}_active_count'] = active_pe_count
        campus_context[f'{prefix}_total_hours'] = round(total_camp_hours, 1)
        campus_context[f'{prefix}_avg_hours'] = round(avg_hours, 1)

    # Sort campuses by total_hours descending
    campus_list.sort(key=lambda x: (x['total_hours'], x['avg_hours']), reverse=True)

    # Chart data
    all_past_events = VolunteerActivity.objects.filter(date_time__lte=now).order_by('date_time')
    turnout_labels = []
    expected_data = []
    actual_data = []

    for event in all_past_events:
        turnout_labels.append(event.title)
        total_rsvps = ActivitySignup.objects.filter(activity=event).count()
        expected_data.append(total_rsvps)
        attended_count = ActivitySignup.objects.filter(activity=event, attended=True).count()
        actual_data.append(attended_count)

    all_time_rsvps = ActivitySignup.objects.count()
    all_time_attended = ActivitySignup.objects.filter(attended=True).count()
    attendance_rate = round((all_time_attended / all_time_rsvps) * 100, 1) if all_time_rsvps > 0 else 0.0

    late_count = ActivitySignup.objects.filter(
        attended=True,
        sign_in_time__isnull=False,
        sign_in_time__gt=F('activity__date_time')
    ).count()
    total_attended = ActivitySignup.objects.filter(attended=True).count()
    on_time_count = max(0, total_attended - late_count)
    excused_count = ActivitySignup.objects.filter(attended=False).count()

    # Feedback & Ratings from DB
    all_feedbacks = Feedback.objects.select_related('user').order_by('-created_at')
    rating_data = Feedback.objects.filter(rating__isnull=False).aggregate(avg=Avg('rating'), count=Count('id'))
    avg_rating = round(float(rating_data['avg']), 1) if rating_data['avg'] is not None else None
    total_rating_reviews = rating_data['count'] or 0

    camp_tickets_count = CampTicket.objects.count()
    lms_cert_count = StudentProgress.objects.count()
    career_assets_count = CareerToolkitAsset.objects.count()

    context = {
        'year': year,
        'report_date': now.strftime("%d %B %Y"),
        'total_hours': total_hours,
        'total_events': total_events,
        'total_registered': total_registered,
        'active_peers': active_peers,
        'attendance_rate': attendance_rate,
        'avg_rating': avg_rating,
        'total_rating_reviews': total_rating_reviews,
        'camp_tickets_count': camp_tickets_count,
        'lms_cert_count': lms_cert_count,
        'career_assets_count': career_assets_count,
        'campus_list': campus_list,

        'chart_labels': json.dumps(turnout_labels),
        'chart_expected': expected_data,
        'chart_actual': actual_data,

        'punctuality_on_time': on_time_count,
        'punctuality_late': late_count,
        'punctuality_excused': excused_count,

        'feedbacks': all_feedbacks,
        **campus_context,
    }
    return render(request, 'core/yearly_report.html', context)


client = OpenAI(api_key=getattr(settings, 'OPENAI_API_KEY', ''))


def _gather_user_career_facts(user):
    """
    Collects all verified facts for a student's Career Toolkit generation & PDF report:
    - Verified hours (event + manual bonus), events count, punctuality, recent event names
    - 2026 Programme completion status & 2026 Official Certificate Holder (Camp Delegate) status
    - Executive role & campus (including APB 2026 Campus of the Year recognition)
    - All earned awards (SpecialAwards, Milestone Badges, 2026 Live Awards standings, and Management Awards)
    - All completed LMS courses & quiz certifications
    """
    from .models import CampTicket
    from users.models import User, VolunteerBadge
    from lms.models import StudentProgress
    import json
    import os

    current_year = timezone.now().year
    stats = ActivitySignup.objects.filter(user=user, attended=True).aggregate(
        total_hours=Sum('hours_earned'),
        total_events=Count('id'),
        early_count=Sum(
            Case(
                When(sign_in_time__lte=F('activity__date_time'), then=Value(1)),
                default=Value(0),
                output_field=IntegerField()
            )
        )
    )
    total_hours = round(float(stats['total_hours'] or 0.0) + float(getattr(user, 'manual_bonus_hours', 0.0) or 0.0), 1)
    events_attended = stats['total_events'] or 0
    early_count = stats['early_count'] or 0
    punctuality_pct = round((early_count / events_attended) * 100, 1) if events_attended > 0 else 0.0

    CAMPUS_NAMES = {
        'APB': 'Auckland Park Bunting Road (APB)',
        'APK': 'Auckland Park Kingsway (APK)',
        'DFC': 'Doornfontein Campus (DFC)',
        'SWC': 'Soweto Campus (SWC)',
    }
    campus_code = (getattr(user, 'campus', '') or 'APB').upper()
    campus_display = CAMPUS_NAMES.get(campus_code, campus_code)

    exec_pos = getattr(user, 'executive_position', None)
    if exec_pos and exec_pos != "None":
        roles = f"{exec_pos} & Peer Educator Volunteer"
    else:
        exec_pos = None
        roles = "Campus Peer Educator Volunteer"

    first_event = ActivitySignup.objects.filter(user=user, attended=True).order_by('sign_in_time').first()
    start_date = first_event.sign_in_time.strftime("%B %Y") if (first_event and first_event.sign_in_time) else f"February {current_year}"
    start_year = first_event.sign_in_time.year if (first_event and first_event.sign_in_time) else current_year
    years_active = f"{start_year} – {current_year}" if start_year != current_year else f"{current_year}"

    # 1. Camp Ticket / Official 2026 Certificate Holder Status
    camp_ticket = CampTicket.objects.filter(
        user=user,
        status__in=['active', 'confirmed'],
        user__is_camp_eligible=True
    ).first()
    is_certificate_holder = bool(camp_ticket)
    is_programme_completed = bool(total_hours >= 80.0 or is_certificate_holder)

    if is_programme_completed and total_hours >= 80.0:
        completion_status = f"Officially Completed the {current_year} C-SHAW Peer Educator Volunteering Programme (Exceeded the 80-hour annual target with {total_hours} verified hours)"
    elif is_programme_completed and is_certificate_holder:
        completion_status = f"Officially Completed the {current_year} C-SHAW Peer Educator Volunteering Programme ({total_hours} verified hours & Selected Year-End Camp Delegate)"
    else:
        completion_status = f"Completed {total_hours} verified hours across {events_attended} events in the {current_year} C-SHAW Peer Educator Volunteering Programme"

    certificates_list = []
    if is_certificate_holder:
        rank_str = f", Cohort Rank #{camp_ticket.cohort_rank}" if camp_ticket.cohort_rank else ""
        title_str = f" — {camp_ticket.honor_title}" if camp_ticket.honor_title else ""
        certificates_list.append(
            f"2026 Official C-SHAW Peer Educator Certificate Holder (Year-End Camp Delegate{rank_str}{title_str})"
        )

    # 2. LMS Courses & Certificates Completed
    lms_progress = StudentProgress.objects.filter(
        user=user,
        score__gte=50.0
    ).select_related('quiz', 'quiz__learning_unit', 'quiz__learning_unit__topic').order_by('-score', '-completed_at')

    lms_courses = []
    for prog in lms_progress:
        topic_name = prog.quiz.learning_unit.topic.title if (prog.quiz and prog.quiz.learning_unit and prog.quiz.learning_unit.topic) else ""
        quiz_name = prog.quiz.title if prog.quiz else "Training Module"
        label = f"{topic_name}: {quiz_name}" if topic_name and topic_name.lower() not in quiz_name.lower() else quiz_name
        if prog.score >= 100.0:
            lms_courses.append(f"{label} (100% Mastery Certificate)")
        else:
            lms_courses.append(f"{label} ({int(round(prog.score))}% Score)")

    all_certificates = certificates_list + lms_courses

    # 3. Awards & Honours (Profile Awards + Milestone Badges + Live Awards + Management Awards + APB Campus of the Year)
    awards_list = []
    for a in user.awards.all():
        awards_list.append(f"{a.name} ({a.date_awarded})" if a.date_awarded else a.name)

    full_name_clean = f"{user.first_name} {user.last_name}".strip().lower()
    if "vuyiswa" in full_name_clean and "mbena" in full_name_clean:
        awards_list.append("2026 Innovator of the Year Award (Decided by C-SHAW Management)")
    if "siyabonga" in full_name_clean and ("hlatshwayo" in full_name_clean or "hlatswayo" in full_name_clean):
        awards_list.append("2026 Social Media Award (Decided by C-SHAW Management)")

    # Check Live Awards Top 3 placements from locked snapshot if present
    try:
        snapshot_path = LiveAwardsAPIView.get_locked_snapshot_path()
        if os.path.exists(snapshot_path):
            with open(snapshot_path, 'r', encoding='utf-8') as f:
                snap = json.load(f)
            for idx, item in enumerate(snap.get('overall', [])[:3], 1):
                if item.get('id') == user.id or (item.get('name', '').strip().lower() == full_name_clean):
                    place = "Winner (#1)" if idx == 1 else f"Top {idx} Finalist"
                    awards_list.append(f"2026 Peer Educator of the Year — {place} ({item.get('power_score')} Power Score)")
            for idx, item in enumerate(snap.get('newcomers', [])[:3], 1):
                if item.get('id') == user.id or (item.get('name', '').strip().lower() == full_name_clean):
                    place = "Winner (#1)" if idx == 1 else f"Top {idx} Finalist"
                    awards_list.append(f"2026 Best Junior Peer Educator — {place} ({item.get('power_score')} Power Score)")
    except Exception:
        pass

    if total_hours >= 80.0:
        awards_list.append("80+ Hours Gold Service Milestone Badge")
    elif total_hours >= 40.0:
        awards_list.append("40+ Hours Silver Service Milestone Badge")

    if campus_code == 'APB':
        awards_list.append("Member of APB Campus — 2026 C-SHAW Campus of the Year Winner")

    # Deduplicate while preserving order
    seen_awards = set()
    dedup_awards = []
    for aw in awards_list:
        if aw.lower() not in seen_awards:
            seen_awards.add(aw.lower())
            dedup_awards.append(aw)

    # 4. Key Events Attended
    attended_signups = ActivitySignup.objects.filter(
        user=user,
        attended=True
    ).exclude(
        activity__description="Manual hours allocation event"
    ).select_related('activity').order_by('-hours_earned', '-sign_out_time')[:8]

    event_titles = []
    seen_titles = set()
    for s in attended_signups:
        t = (s.activity.title or '').strip()
        if t and t.lower() not in seen_titles:
            seen_titles.add(t.lower())
            event_titles.append(f"{t} ({s.hours_earned}h)")

    return {
        'total_hours': total_hours,
        'events_attended': events_attended,
        'early_count': early_count,
        'punctuality_pct': punctuality_pct,
        'roles': roles,
        'exec_pos': exec_pos,
        'campus_code': campus_code,
        'campus_display': campus_display,
        'start_date': start_date,
        'years_active': years_active,
        'current_year': current_year,
        'is_certificate_holder': is_certificate_holder,
        'is_programme_completed': is_programme_completed,
        'completion_status': completion_status,
        'certificates_list': certificates_list,
        'lms_courses': lms_courses,
        'all_certificates': all_certificates,
        'awards_list': dedup_awards,
        'event_titles': event_titles,
    }


def _build_fallback_career_text(gen_type, user, facts):
    """
    Deterministic, 100% fact-grounded fallback generator if the OpenAI API is unreachable.
    """
    org_line = f"C-SHAW (Centre for Student Health and Wellness) — {facts['campus_display']}"
    certs_str = ", ".join(facts['all_certificates']) if facts['all_certificates'] else "Peer Educator Training Modules"
    awards_str = ", ".join(facts['awards_list']) if facts['awards_list'] else "Verified Service Recognition"
    events_str = ", ".join(facts['event_titles'][:4]) if facts['event_titles'] else "campus health and community outreach drives"

    if gen_type == 'cv':
        bullets = [
            f"• {facts['completion_status']}, logging {facts['total_hours']} verified volunteer hours across {facts['events_attended']} campus wellness and community outreach initiatives ({events_str}).",
        ]
        if facts['exec_pos']:
            bullets.append(
                f"• Served as {facts['exec_pos']} for {facts['campus_display']}, coordinating peer educators, managing event execution, and maintaining a {facts['punctuality_pct']}% on-time attendance record."
            )
        else:
            bullets.append(
                f"• Collaborated with campus executive teams at {facts['campus_display']} to facilitate student health awareness drives, peer education activations, and community engagement programmes."
            )
        bullets.append(
            f"• Earned official programme certifications and training masteries including: {certs_str}."
        )
        bullets.append(
            f"• Recognized with the following honours and milestones: {awards_str}."
        )
        return f"{facts['roles']}\n{org_line}\n{facts['start_date']} – Present\n\n" + "\n".join(bullets)

    if gen_type == 'linkedin':
        lead_sentence = (
            f"As a {facts['roles']} with C-SHAW at {facts['campus_display']}, I have {facts['completion_status'].lower()}, contributing {facts['total_hours']} verified service hours across {facts['events_attended']} health awareness and community outreach initiatives."
        )
        p1 = f"{lead_sentence} Throughout my time in the programme, I actively supported campaigns including {events_str}, working alongside fellow peer educators to promote student wellbeing and community impact."
        p2 = f"To strengthen my practical leadership and peer education skills, I completed specialized certifications ({certs_str}) and was honoured with {awards_str}. This experience has shaped my ability to lead with empathy, communicate effectively, and deliver measurable impact in team environments."
        return f"{p1}\n\n{p2}"

    # scholarship / application statement
    p1 = (
        f"My commitment to community service and student wellness was shaped through my role as a {facts['roles']} with C-SHAW (Centre for Student Health and Wellness) at {facts['campus_display']}. "
        f"During the {facts['current_year']} season, I {facts['completion_status'].lower()}, dedicating {facts['total_hours']} verified hours across {facts['events_attended']} structured outreach events and campaigns."
    )
    p2 = (
        f"Across initiatives such as {events_str}, I worked directly with students and community members to advance health awareness, mentorship, and inclusive peer support. "
        + (f"In my executive capacity as {facts['exec_pos']}, I also helped coordinate campus volunteer teams and drive consistent event execution. " if facts['exec_pos'] else "")
        + f"Maintaining a {facts['punctuality_pct']}% punctuality record across my attended events reinforced the discipline and reliability required for effective community leadership."
    )
    p3 = (
        f"Beyond field service, I invested in continuous learning and earned the following certifications and honours: {certs_str}, alongside {awards_str}. "
        f"Completing the C-SHAW programme has equipped me with the resilience, collaborative mindset, and proven service record that I will bring to future academic and professional opportunities."
    )
    return f"{p1}\n\n{p2}\n\n{p3}"


class CareerToolkitStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        facts = _gather_user_career_facts(user)

        saved_assets = CareerToolkitAsset.objects.filter(user=user)
        asset_status = {
            'cv': {'exists': False, 'needs_update': False},
            'linkedin': {'exists': False, 'needs_update': False},
            'scholarship': {'exists': False, 'needs_update': False},
        }

        for asset in saved_assets:
            # Allow updating any saved asset so students can refresh with their final 2026 Year-End awards & certificates
            asset_status[asset.asset_type] = {
                'exists': True,
                'needs_update': True,
                'content': asset.generated_content
            }

        return Response({
            "totalHours": facts['total_hours'],
            "eventsAttended": facts['events_attended'],
            "roles": facts['roles'],
            "yearsActive": facts['years_active'],
            "assetStatus": asset_status
        })


class CareerToolkitGenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        gen_type = request.data.get('type')
        user = request.user

        if gen_type not in ['cv', 'linkedin', 'scholarship']:
            return Response({"error": "Invalid generation type."}, status=status.HTTP_400_BAD_REQUEST)

        facts = _gather_user_career_facts(user)
        total_hours = facts['total_hours']
        events_attended = facts['events_attended']

        certs_str = "; ".join(facts['all_certificates']) if facts['all_certificates'] else "None recorded"
        awards_str = "; ".join(facts['awards_list']) if facts['awards_list'] else "None recorded"
        events_str = "; ".join(facts['event_titles']) if facts['event_titles'] else "General campus wellness activities"

        # Construct the Grounded Context Data with all verified facts
        volunteer_context = f"""
        Student Name: {user.first_name} {user.last_name}
        Organization: C-SHAW - Centre for Student Health and Wellness ({facts['campus_display']})
        Role(s) Held: {facts['roles']}
        Executive Leadership Position: {facts['exec_pos'] or 'None'}
        Timeframe: {facts['start_date']} – Present ({facts['years_active']})
        Overall Programme Completion Status: {facts['completion_status']}
        2026 Official Certificate Holder (Year-End Camp Delegate): {'Yes — ' + '; '.join(facts['certificates_list']) if facts['is_certificate_holder'] else 'No'}
        Total Verified Volunteer Hours: {total_hours} hours (Target: 80 hours)
        Total Events Attended / Organized: {events_attended} events ({facts['punctuality_pct']}% on-time arrival rate)
        Key Events & Campaigns Attended: {events_str}
        Awards, Badges & Honours Won: {awards_str}
        Certificates & LMS Training Modules Completed: {certs_str}
        """

        system_prompt = (
            "You are an expert career coach helping a university student translate their verified 2026 C-SHAW "
            "volunteering record into factual, high-impact career content. "
            "Write in a grounded, confident, professional tone. "
            "DO NOT invent facts or use generic filler—use the exact verified facts provided.\n"
            "CRITICAL FACT REQUIREMENTS:\n"
            "1. Explicitly state their 'Overall Programme Completion Status', 'Total Verified Volunteer Hours', and 'Total Events Attended'.\n"
            "2. Explicitly include their 'Awards, Badges & Honours Won' (including Campus of the Year, Management Awards, or Milestone Badges if listed).\n"
            "3. Explicitly include their '2026 Official Certificate Holder' status (if Yes) and 'Certificates & LMS Training Modules Completed'.\n"
            "4. Mention specific 'Key Events & Campaigns Attended' and their Executive Leadership Position (if any).\n\n"
            "CRITICAL FORMATTING RULE: Do not use markdown formatting. Do not use asterisks (**), "
            "underscores (_), or header hashes (#). Return pure, clean plaintext with normal line breaks."
        )

        if gen_type == 'cv':
            user_prompt = (
                f"Based strictly on the verified data below, write a structured CV experience section.\n"
                f"Start with the Role Title, Organization Name, and Date Range on separate lines.\n"
                f"Follow with 4 to 5 concise, action-oriented bullet points using the literal bullet character (•).\n"
                f"Ensure the bullet points explicitly cover:\n"
                f"(1) Overall programme completion status, exact verified hours ({total_hours}h), and event count ({events_attended} events),\n"
                f"(2) Executive leadership responsibilities (if executive) or key campaigns attended,\n"
                f"(3) Official 2026 Certificate Holder status and LMS training modules/certificates completed,\n"
                f"(4) Exact awards, honours, and campus recognition won.\n\n"
                f"Verified Data:\n{volunteer_context}"
            )
        elif gen_type == 'linkedin':
            user_prompt = (
                f"Based strictly on the verified data below, write a 2-paragraph professional LinkedIn summary in the first person.\n"
                f"Paragraph 1 must state their role, overall 2026 programme completion status, exact verified hours ({total_hours}h), events attended ({events_attended}), and key campaigns.\n"
                f"Paragraph 2 must highlight their Official 2026 Certificate status, completed LMS training modules/certificates, and all awards/honours won.\n"
                f"Separate paragraphs with a single blank line. Do not include title headers.\n\n"
                f"Verified Data:\n{volunteer_context}"
            )
        else:
            user_prompt = (
                f"Based strictly on the verified data below, draft a 3-paragraph application statement suitable for a scholarship, graduate programme, or job application in the first person.\n"
                f"Paragraph 1: Introduce their C-SHAW journey, overall programme completion status, and exact verified hours ({total_hours}h across {events_attended} events).\n"
                f"Paragraph 2: Detail their executive leadership role (if applicable), specific campaigns supported, and reliability.\n"
                f"Paragraph 3: Explicitly cite their Official 2026 Certificate status, completed LMS training modules, and awards/honours won.\n"
                f"Separate paragraphs with a single blank line. Do not include headers.\n\n"
                f"Verified Data:\n{volunteer_context}"
            )

        generated_text = None
        api_key = getattr(settings, 'OPENAI_API_KEY', '')
        if api_key:
            for model_name in ("gpt-4o-mini", "gpt-4o"):
                try:
                    response = client.chat.completions.create(
                        model=model_name,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.5,
                        max_tokens=750
                    )
                    generated_text = response.choices[0].message.content.strip()
                    break
                except Exception as e:
                    logger.warning("OpenAI generation with model %s failed: %s", model_name, e)

        if not generated_text:
            generated_text = _build_fallback_career_text(gen_type, user, facts)

        CareerToolkitAsset.objects.update_or_create(
            user=user,
            asset_type=gen_type,
            defaults={
                'generated_content': generated_text,
                'hours_at_generation': total_hours,
                'events_at_generation': events_attended
            }
        )

        return Response({"content": generated_text})


class CareerToolkitReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        facts = _gather_user_career_facts(user)

        total_hours = facts["total_hours"]
        events_attended = facts["events_attended"]
        roles = facts["roles"]

        first_event = ActivitySignup.objects.filter(user=user, attended=True).order_by('sign_in_time').first()
        start_year = first_event.sign_in_time.year if (first_event and first_event.sign_in_time) else timezone.now().year
        current_year = timezone.now().year
        years_active = f"{start_year} - {current_year}" if start_year != current_year else f"{current_year}"

        # Setup the PDF Response
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="CSHAW_Impact_Report_{user.last_name or user.username}.pdf"'

        # Create the PDF Canvas
        p = canvas.Canvas(response, pagesize=letter)
        width, height = letter

        # --- Define Brand Colors ---
        NAVY = colors.HexColor("#0f172a")
        ORANGE = colors.HexColor("#E35205")
        GREEN = colors.HexColor("#059669")
        LIGHT_GREY = colors.HexColor("#f8fafc")
        BORDER_GREY = colors.HexColor("#e2e8f0")
        TEXT_MAIN = colors.HexColor("#1e293b")
        TEXT_MUTED = colors.HexColor("#64748b")

        # --- 1. HEADER (Deep Navy with Orange Accent) ---
        p.setFillColor(NAVY)
        p.rect(0, height - 105, width, 105, fill=1, stroke=0)
        
        p.setFillColor(ORANGE)
        p.rect(0, height - 110, width, 5, fill=1, stroke=0)
        
        p.setFillColor(colors.white)
        p.setFont("Helvetica-Bold", 22)
        p.drawString(40, height - 52, "OFFICIAL 2026 IMPACT & COMPLETION REPORT")
        
        p.setFillColor(colors.HexColor("#cbd5e1"))
        p.setFont("Helvetica", 11)
        p.drawString(40, height - 76, "C-SHAW | Centre for Student Health and Wellness | University of Johannesburg")

        # --- 2. DOCUMENT META ---
        p.setFillColor(TEXT_MUTED)
        p.setFont("Helvetica", 10)
        p.drawString(40, height - 140, f"Issued: {timezone.now().strftime('%d %B %Y')}   |   Campus: {facts['campus_display']} ({facts['campus_code']})")
        p.drawString(40, height - 155, f"Programme Status: {facts['completion_status']}")

        # --- 3. STUDENT PROFILE BOX (Light Grey Rounded Rectangle) ---
        p.setFillColor(LIGHT_GREY)
        p.setStrokeColor(BORDER_GREY)
        p.roundRect(40, height - 255, width - 80, 80, radius=8, fill=1, stroke=1)

        p.setFillColor(TEXT_MUTED)
        p.setFont("Helvetica-Bold", 9)
        p.drawString(60, height - 200, "VOLUNTEER NAME")
        p.drawString(250, height - 200, "PRIMARY ROLE")
        p.drawString(460, height - 200, "ACTIVE COHORT")

        p.setFillColor(TEXT_MAIN)
        p.setFont("Helvetica-Bold", 13)
        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        p.drawString(60, height - 224, full_name[:26])

        p.setFont("Helvetica", 11)
        display_role = roles[:28] + "..." if len(roles) > 28 else roles
        p.drawString(250, height - 224, display_role)
        p.drawString(460, height - 224, str(years_active))

        # --- 4. THE METRICS DASHBOARD ---
        # Badge 1: Total Hours
        p.setFillColor(colors.white)
        p.setStrokeColor(ORANGE)
        p.roundRect(40, height - 355, 165, 80, radius=8, fill=1, stroke=1)
        p.setFillColor(ORANGE)
        p.setFont("Helvetica-Bold", 26)
        p.drawString(55, height - 315, f"{total_hours}h")
        p.setFillColor(TEXT_MAIN)
        p.setFont("Helvetica-Bold", 10)
        p.drawString(55, height - 338, "Total Verified Hours")

        # Badge 2: Events Attended
        p.setFillColor(colors.white)
        p.setStrokeColor(BORDER_GREY)
        p.roundRect(220, height - 355, 165, 80, radius=8, fill=1, stroke=1)
        p.setFillColor(NAVY)
        p.setFont("Helvetica-Bold", 26)
        p.drawString(235, height - 315, f"{events_attended}")
        p.setFillColor(TEXT_MUTED)
        p.setFont("Helvetica-Bold", 10)
        p.drawString(235, height - 338, f"Events ({facts['punctuality_pct']}% On-Time)")

        # Badge 3: Certificates & Courses
        cert_count = len(facts["all_certificates"])
        p.setFillColor(colors.white)
        p.setStrokeColor(GREEN if facts["is_programme_completed"] else BORDER_GREY)
        p.roundRect(400, height - 355, width - 440, 80, radius=8, fill=1, stroke=1)
        p.setFillColor(GREEN if facts["is_programme_completed"] else NAVY)
        p.setFont("Helvetica-Bold", 26)
        p.drawString(415, height - 315, f"{cert_count}")
        p.setFillColor(TEXT_MAIN)
        p.setFont("Helvetica-Bold", 10)
        p.drawString(415, height - 338, "Certificates & Modules")

        # --- 5. AWARDS, CERTIFICATES & TRAINING DETAILS ---
        y_cursor = height - 390

        p.setFillColor(NAVY)
        p.setFont("Helvetica-Bold", 12)
        p.drawString(40, y_cursor, "VERIFIED AWARDS & HONOURS")
        y_cursor -= 18

        p.setFillColor(TEXT_MAIN)
        p.setFont("Helvetica", 10)
        awards_to_show = facts["awards_list"][:6] if facts["awards_list"] else ["Active C-SHAW Peer Educator Member (2026 Season)"]
        for award_item in awards_to_show:
            p.drawString(52, y_cursor, f"• {award_item[:95]}")
            y_cursor -= 15

        y_cursor -= 12
        p.setFillColor(NAVY)
        p.setFont("Helvetica-Bold", 12)
        p.drawString(40, y_cursor, "CERTIFICATES & TRAINING COMPLETED")
        y_cursor -= 18

        p.setFillColor(TEXT_MAIN)
        p.setFont("Helvetica", 10)
        cert_lines = facts["all_certificates"][:7] if facts["all_certificates"] else ["Active C-SHAW Peer Educator Training Participant"]
        for cline in cert_lines:
            p.drawString(52, y_cursor, f"• {cline[:95]}")
            y_cursor -= 15

        if facts["event_titles"]:
            y_cursor -= 12
            p.setFillColor(NAVY)
            p.setFont("Helvetica-Bold", 12)
            p.drawString(40, y_cursor, "KEY CAMPAIGNS & OUTREACH EVENTS SUPPORTED")
            y_cursor -= 18
            p.setFillColor(TEXT_MAIN)
            p.setFont("Helvetica", 10)
            for ev_title in facts["event_titles"][:5]:
                p.drawString(52, y_cursor, f"• {ev_title[:95]}")
                y_cursor -= 15

        # --- 6. VERIFICATION FOOTER ---
        p.setStrokeColor(BORDER_GREY)
        p.line(40, 70, width - 40, 70)

        p.setFillColor(TEXT_MUTED)
        p.setFont("Helvetica-Oblique", 9)
        p.drawString(40, 50, "This is an automated, official record generated by the C-SHAW Volunteer Management System.")
        p.drawString(40, 35, "All hours, awards, and certificates represented here have been verified by campus executives and C-SHAW staff.")

        p.showPage()
        p.save()

        return response

@login_required
def live_awards_page(request):
    return render(request, 'core/live_awards.html')

@login_required
def allocate_hours_page(request):
    from users.models import User
    from .models import VolunteerActivity
    if request.user.role != User.Roles.COORDINATOR and not request.user.is_superuser:
        from django.http import HttpResponseForbidden
        return HttpResponseForbidden("Only coordinators can view this page.")
        
    # Fetch history of manual allocations with student data
    manual_events = VolunteerActivity.objects.filter(
        description="Manual hours allocation event"
    ).select_related('created_by').prefetch_related('signups__user').order_by('-date_time')
    
    context = {
        'manual_events': manual_events
    }
    return render(request, 'core/allocate_hours.html', context)

class ManualHoursAllocationAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCoordinator]

    def post(self, request):
        event_name = request.data.get('event_name')
        hours = request.data.get('hours')
        student_ids = request.data.get('student_ids', [])

        if not event_name or not hours or not student_ids:
            return Response({"error": "Missing required fields."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            hours = float(hours)
        except ValueError:
            return Response({"error": "Invalid hours format."}, status=status.HTTP_400_BAD_REQUEST)

        # Create a proxy activity for the manual allocation
        activity = VolunteerActivity.objects.create(
            title=event_name,
            date_time=timezone.now(),
            duration_hours=hours,
            created_by=request.user,
            description="Manual hours allocation event",
            details="Manually allocated hours by coordinator."
        )

        from users.models import User
        from users.services import BackgroundEmailService
        students = User.objects.filter(id__in=student_ids, role=User.Roles.STUDENT)

        for student in students:
            ActivitySignup.objects.create(
                user=student,
                activity=activity,
                attended=True,
                sign_in_time=timezone.now(),
                sign_out_time=timezone.now(),
                hours_earned=hours,
                session_history=[{"type": "Manual added hours", "hours": hours}]
            )
            
            # Send Notification Email
            html_content = render_to_string('core/emails/manual_hours.html', {
                'first_name': student.first_name,
                'hours': hours,
                'event_name': event_name
            })
            BackgroundEmailService._send_async(
                subject="You've been allocated new hours!",
                to_emails=[student.email],
                html_content=html_content
            )

        log_audit_event(
            action="MANUAL_HOURS_ALLOCATED",
            actor=request.user,
            target_type="VolunteerActivity",
            target_id=activity.id,
            metadata={
                "event_name": event_name,
                "hours": hours,
                "students_count": students.count(),
                "student_ids": list(student_ids)
            }
        )
        logger.info("Manual hours allocated: %sh to %d students for '%s' by %s", hours, students.count(), event_name, request.user.email)

        return Response({"message": f"Successfully allocated {hours} hours to {students.count()} students for '{event_name}'."})

class LiveAwardsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def get_locked_snapshot_path():
        from django.conf import settings
        import os
        media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
        os.makedirs(media_root, exist_ok=True)
        return os.path.join(media_root, 'locked_live_awards_2026.json')

    def get(self, request):
        import json
        import os
        snapshot_path = self.get_locked_snapshot_path()
        if os.path.exists(snapshot_path):
            try:
                with open(snapshot_path, 'r', encoding='utf-8') as f:
                    return Response(json.load(f))
            except Exception:
                pass

        from users.models import User
        from django.db.models import Sum, Count, Case, When, Value, IntegerField, F
        from django.utils import timezone
        
        current_year = timezone.now().year
        
        stats = ActivitySignup.objects.filter(
            user__role=User.Roles.STUDENT,
            attended=True,
            sign_out_time__year=current_year
        ).values('user').annotate(
            total_hours=Sum('hours_earned'),
            events_attended=Count('id'),
            early_count=Sum(
                Case(
                    When(sign_in_time__lte=F('activity__date_time'), then=Value(1)),
                    default=Value(0),
                    output_field=IntegerField()
                )
            )
        )
        
        user_stats_map = {}
        for s in stats:
            user_stats_map[s['user']] = {
                'total_hours': float(s['total_hours'] or 0.0),
                'events_attended': s['events_attended'],
                'early_count': s['early_count'] or 0
            }
            
        students = User.objects.filter(role=User.Roles.STUDENT)
        all_students = students.values('id', 'first_name', 'last_name', 'points', 'manual_bonus_hours', 'campus', 'volunteer_status')
        
        max_hours = 0.0
        max_events = 0
        max_points = 0
        
        compiled_data = []
        
        for student in all_students:
            uid = student['id']
            base_points = student['points'] or 0
            bonus = float(student['manual_bonus_hours'] or 0.0)
            
            s_data = user_stats_map.get(uid, {'total_hours': 0.0, 'events_attended': 0, 'early_count': 0})
            
            t_hours = s_data['total_hours'] + bonus
            t_events = s_data['events_attended']
            
            if t_hours > max_hours:
                max_hours = t_hours
            if t_events > max_events:
                max_events = t_events
            if base_points > max_points:
                max_points = base_points
                
            compiled_data.append({
                'id': uid,
                'name': f"{student['first_name']} {student['last_name']}",
                'campus': student['campus'],
                'volunteer_status': student['volunteer_status'],
                'hours': t_hours,
                'events': t_events,
                'points': base_points,
                'early_count': s_data['early_count']
            })
            
        if max_hours == 0: max_hours = 1
        if max_events == 0: max_events = 1
        if max_points == 0: max_points = 1
        
        for data in compiled_data:
            score_hours = (data['hours'] / max_hours) * 100 * 0.50
            score_events = (data['events'] / max_events) * 100 * 0.25
            score_points = (data['points'] / max_points) * 100 * 0.10
            punctuality_pct = (data['early_count'] / data['events']) * 100 if data['events'] > 0 else 0
            score_punctuality = punctuality_pct * 0.15
            
            data['punctuality_pct'] = round(punctuality_pct, 1)
            data['score_hours'] = round(score_hours, 2)
            data['score_events'] = round(score_events, 2)
            data['score_points'] = round(score_points, 2)
            data['score_punctuality'] = round(score_punctuality, 2)
            
            data['power_score'] = round(score_hours + score_events + score_points + score_punctuality, 2)
            
        compiled_data.sort(key=lambda x: x['power_score'], reverse=True)
        
        # Peer Educator of the Year: Exclusively for Senior (Returning) Volunteers (Newcomers cannot win/contend)
        seniors = [d for d in compiled_data if d['volunteer_status'] == User.VolunteerStatus.SENIOR]
        seniors_top_5 = seniors[:5]
        
        # Best Junior Peer Educator: For Newcomers (First Time)
        newcomers = [d for d in compiled_data if d['volunteer_status'] == User.VolunteerStatus.NEWCOMER]
        newcomers_top_5 = newcomers[:5]
        
        campus_totals = {}
        for d in compiled_data:
            c = d['campus']
            if not c:
                continue
            if c not in campus_totals:
                campus_totals[c] = {
                    'total_score': 0, 'count': 0,
                    'total_hours_score': 0, 'total_events_score': 0,
                    'total_points_score': 0, 'total_punctuality_score': 0,
                    'raw_hours': 0, 'raw_events': 0, 'raw_points': 0
                }
            campus_totals[c]['total_score'] += d['power_score']
            campus_totals[c]['total_hours_score'] += d['score_hours']
            campus_totals[c]['total_events_score'] += d['score_events']
            campus_totals[c]['total_points_score'] += d['score_points']
            campus_totals[c]['total_punctuality_score'] += d['score_punctuality']
            campus_totals[c]['raw_hours'] += d['hours']
            campus_totals[c]['raw_events'] += d['events']
            campus_totals[c]['raw_points'] += d['points']
            campus_totals[c]['count'] += 1
            
        campus_avg = []
        for c, totals in campus_totals.items():
            cnt = totals['count']
            if cnt > 0:
                campus_avg.append({
                    'campus': c,
                    'avg_score': round(totals['total_score'] / cnt, 2),
                    'score_hours': round(totals['total_hours_score'] / cnt, 2),
                    'score_events': round(totals['total_events_score'] / cnt, 2),
                    'score_points': round(totals['total_points_score'] / cnt, 2),
                    'score_punctuality': round(totals['total_punctuality_score'] / cnt, 2),
                    'avg_raw_hours': round(totals['raw_hours'] / cnt, 1),
                    'avg_raw_events': round(totals['raw_events'] / cnt, 1),
                    'avg_raw_points': round(totals['raw_points'] / cnt, 1)
                })
            
        campus_avg.sort(key=lambda x: x['avg_score'], reverse=True)
        
        payload = {
            'locked': True,
            'overall': seniors_top_5,
            'newcomers': newcomers_top_5,
            'campuses': campus_avg
        }
        try:
            with open(snapshot_path, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2)
        except Exception:
            pass

        return Response(payload)


class YearEndRoundupAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from users.models import User
        from .models import CampTicket, VolunteerActivity
        from django.db.models import Sum, Count, Case, When, Value, IntegerField, F
        from django.utils import timezone

        current_year = timezone.now().year
        user = request.user

        # 1. Per-student attendance & punctuality stats for the year
        stats = ActivitySignup.objects.filter(
            user__role=User.Roles.STUDENT,
            attended=True,
            sign_out_time__year=current_year
        ).values('user').annotate(
            total_hours=Sum('hours_earned'),
            events_attended=Count('id'),
            early_count=Sum(
                Case(
                    When(sign_in_time__lte=F('activity__date_time'), then=Value(1)),
                    default=Value(0),
                    output_field=IntegerField()
                )
            )
        )

        user_stats_map = {}
        for s in stats:
            user_stats_map[s['user']] = {
                'total_hours': float(s['total_hours'] or 0.0),
                'events_attended': s['events_attended'] or 0,
                'early_count': s['early_count'] or 0
            }

        students = User.objects.filter(role=User.Roles.STUDENT)
        all_students = list(students.values(
            'id', 'first_name', 'last_name', 'points',
            'manual_bonus_hours', 'campus', 'volunteer_status',
            'executive_position', 'is_camp_eligible'
        ))

        max_hours = 0.0
        max_events = 0
        max_points = 0
        compiled_data = []
        student_by_id = {}

        for student in all_students:
            uid = student['id']
            base_points = student['points'] or 0
            bonus = float(student['manual_bonus_hours'] or 0.0)
            s_data = user_stats_map.get(uid, {'total_hours': 0.0, 'events_attended': 0, 'early_count': 0})

            t_hours = round(s_data['total_hours'] + bonus, 2)
            t_events = s_data['events_attended']

            if t_hours > max_hours:
                max_hours = t_hours
            if t_events > max_events:
                max_events = t_events
            if base_points > max_points:
                max_points = base_points

            entry = {
                'id': uid,
                'name': f"{student['first_name']} {student['last_name']}".strip(),
                'first_name': student['first_name'],
                'last_name': student['last_name'],
                'campus': student['campus'] or 'APB',
                'volunteer_status': student['volunteer_status'],
                'executive_position': student['executive_position'],
                'hours': t_hours,
                'events': t_events,
                'points': base_points,
                'early_count': s_data['early_count'],
            }
            compiled_data.append(entry)
            student_by_id[uid] = entry

        if max_hours == 0:
            max_hours = 1
        if max_events == 0:
            max_events = 1
        if max_points == 0:
            max_points = 1

        for data in compiled_data:
            score_hours = (data['hours'] / max_hours) * 100 * 0.50
            score_events = (data['events'] / max_events) * 100 * 0.25
            score_points = (data['points'] / max_points) * 100 * 0.10
            punctuality_pct = (data['early_count'] / data['events']) * 100 if data['events'] > 0 else 0
            score_punctuality = punctuality_pct * 0.15

            data['punctuality_pct'] = round(punctuality_pct, 1)
            data['score_hours'] = round(score_hours, 2)
            data['score_events'] = round(score_events, 2)
            data['score_points'] = round(score_points, 2)
            data['score_punctuality'] = round(score_punctuality, 2)
            data['power_score'] = round(score_hours + score_events + score_points + score_punctuality, 2)

        compiled_data.sort(key=lambda x: x['power_score'], reverse=True)

        # 2. Official Certificate Holders (Camp Attendees)
        cert_tickets = list(
            CampTicket.objects.filter(
                status__in=['active', 'confirmed'],
                user__is_camp_eligible=True
            ).select_related('user')
        )

        cert_user_ids = {t.user_id for t in cert_tickets}
        certificate_holders = []
        for t in cert_tickets:
            u_info = student_by_id.get(t.user_id)
            u_hours = u_info['hours'] if u_info else float(t.user.manual_bonus_hours or 0.0)
            u_events = u_info['events'] if u_info else 0
            u_campus = (t.user.campus or 'APB').upper()
            certificate_holders.append({
                'id': t.user_id,
                'name': f"{t.user.first_name} {t.user.last_name}".strip(),
                'campus': u_campus,
                'hours': round(u_hours, 1),
                'events': u_events,
                'cohort_rank': t.cohort_rank,
                'honor_title': t.honor_title or 'Official 2026 Certificate Holder',
                'executive_position': t.user.executive_position if t.user.executive_position and t.user.executive_position != 'None' else None,
                'is_apb': u_campus == 'APB',
                'is_current_user': (t.user_id == user.id),
            })

        certificate_holders.sort(key=lambda x: (x['cohort_rank'] or 999, -x['hours']))

        # 3. Campus Summaries (APB, DFC, APK, SWC)
        CAMPUS_NAMES = {
            'APB': 'Auckland Park Bunting Road',
            'APK': 'Auckland Park Kingsway',
            'DFC': 'Doornfontein Campus',
            'SWC': 'Soweto Campus',
        }
        campus_map = {
            c: {
                'campus': c,
                'campus_name': CAMPUS_NAMES[c],
                'total_hours': 0.0,
                'total_events_participations': 0,
                'active_volunteers': 0,
                'total_registered': 0,
                'total_power_score': 0.0,
                'camp_delegates_count': 0,
                'is_campus_of_the_year': (c == 'APB'),
            }
            for c in ['APB', 'DFC', 'APK', 'SWC']
        }

        total_programme_hours = 0.0
        active_programme_volunteers = 0

        for d in compiled_data:
            c = (d['campus'] or '').upper()
            if c not in campus_map:
                continue
            campus_map[c]['total_registered'] += 1
            campus_map[c]['total_hours'] += d['hours']
            campus_map[c]['total_events_participations'] += d['events']
            campus_map[c]['total_power_score'] += d['power_score']
            total_programme_hours += d['hours']
            if d['hours'] > 0 or d['events'] > 0:
                campus_map[c]['active_volunteers'] += 1
                active_programme_volunteers += 1
            if d['id'] in cert_user_ids:
                campus_map[c]['camp_delegates_count'] += 1

        campus_summaries = []
        for c, info in campus_map.items():
            reg = info['total_registered']
            act = info['active_volunteers']
            info['total_hours'] = round(info['total_hours'], 1)
            info['avg_hours'] = round(info['total_hours'] / act, 1) if act > 0 else 0.0
            info['avg_power_score'] = round(info['total_power_score'] / reg, 2) if reg > 0 else 0.0
            info['hours_share_pct'] = round((info['total_hours'] / total_programme_hours) * 100, 1) if total_programme_hours > 0 else 0.0
            campus_summaries.append(info)

        # Sort with APB (Campus of the Year) first, then by total_hours descending
        campus_summaries.sort(key=lambda x: (0 if x['is_campus_of_the_year'] else 1, -x['total_hours']))

        # 4. Live Awards Summary (Concise Top Winners & Numbers — Locked Snapshot)
        import json
        import os
        seniors = [d for d in compiled_data if d['volunteer_status'] == User.VolunteerStatus.SENIOR]
        newcomers = [d for d in compiled_data if d['volunteer_status'] == User.VolunteerStatus.NEWCOMER]

        snapshot_path = LiveAwardsAPIView.get_locked_snapshot_path()
        locked_awards = None
        if os.path.exists(snapshot_path):
            try:
                with open(snapshot_path, 'r', encoding='utf-8') as f:
                    locked_awards = json.load(f)
            except Exception:
                locked_awards = None

        def serialize_contender(d, rank_idx):
            return {
                'rank': rank_idx,
                'name': d['name'],
                'campus': d['campus'],
                'power_score': d['power_score'],
                'hours': round(d['hours'], 1),
                'events': d['events'],
                'punctuality_pct': d['punctuality_pct'],
                'points': d['points'],
            }

        overall_source = locked_awards.get('overall', seniors[:3]) if locked_awards else seniors[:3]
        newcomers_source = locked_awards.get('newcomers', newcomers[:3]) if locked_awards else newcomers[:3]

        campus_standings = sorted(
            [
                {
                    'campus': c_info['campus'],
                    'campus_name': c_info['campus_name'],
                    'avg_score': c_info['avg_power_score'],
                    'total_hours': c_info['total_hours'],
                    'active_volunteers': c_info['active_volunteers'],
                    'camp_delegates_count': c_info['camp_delegates_count'],
                    'is_winner': c_info['is_campus_of_the_year'],
                }
                for c_info in campus_summaries
            ],
            key=lambda x: (0 if x['is_winner'] else 1, -x['avg_score'])
        )

        # 5. APB Campus of the Year Spotlight (Camp Delegates + Active Contributors)
        apb_camp_delegates = [ch for ch in certificate_holders if ch['campus'] == 'APB']
        apb_active_contributors = [
            {
                'id': d['id'],
                'name': d['name'],
                'hours': round(d['hours'], 1),
                'events': d['events'],
                'power_score': d['power_score'],
                'is_camp_delegate': (d['id'] in cert_user_ids),
                'executive_position': d['executive_position'] if d['executive_position'] and d['executive_position'] != 'None' else None,
                'is_current_user': (d['id'] == user.id),
            }
            for d in sorted(compiled_data, key=lambda x: (-x['hours'], -x['power_score']))
            if (d['campus'] or '').upper() == 'APB' and (d['hours'] > 0 or d['id'] in cert_user_ids)
        ]

        # 6. Current User Personal Spotlight
        current_user_entry = student_by_id.get(user.id)
        user_hours = current_user_entry['hours'] if current_user_entry else float(getattr(user, 'manual_bonus_hours', 0.0) or 0.0)
        user_events = current_user_entry['events'] if current_user_entry else 0
        user_is_cert = (user.id in cert_user_ids)
        user_cert_entry = next((ch for ch in certificate_holders if ch['id'] == user.id), None)

        total_hosted_events = VolunteerActivity.objects.exclude(
            description="Manual hours allocation event"
        ).filter(date_time__year=current_year).count()

        return Response({
            'season_summary': {
                'year': current_year,
                'total_hours': round(total_programme_hours, 1),
                'total_events': total_hosted_events,
                'active_volunteers': active_programme_volunteers,
                'certificate_holders_count': len(certificate_holders),
                'campus_of_the_year': 'APB',
                'campus_of_the_year_name': CAMPUS_NAMES['APB'],
            },
            'user_spotlight': {
                'first_name': user.first_name,
                'last_name': user.last_name,
                'role': user.role,
                'campus': user.campus or 'APB',
                'is_apb': (user.campus == 'APB'),
                'total_hours': round(user_hours, 1),
                'events_count': user_events,
                'is_certificate_holder': user_is_cert,
                'has_completed_goal': bool(user_hours >= 80 or user_is_cert),
                'cohort_rank': user_cert_entry['cohort_rank'] if user_cert_entry else None,
                'honor_title': user_cert_entry['honor_title'] if user_cert_entry else None,
            },
            'campus_summaries': campus_summaries,
            'awards_summary': {
                'overall': [serialize_contender(d, idx + 1) for idx, d in enumerate(overall_source[:3])],
                'newcomers': [serialize_contender(d, idx + 1) for idx, d in enumerate(newcomers_source[:3])],
                'campuses': campus_standings,
            },
            'certificate_holders': certificate_holders,
            'apb_champions': {
                'campus': 'APB',
                'campus_name': CAMPUS_NAMES['APB'],
                'total_hours': campus_map['APB']['total_hours'],
                'active_volunteers': campus_map['APB']['active_volunteers'],
                'camp_delegates_count': len(apb_camp_delegates),
                'camp_delegates': apb_camp_delegates,
                'active_contributors': apb_active_contributors,
            },
        })
