from pyexpat.errors import messages
from django.shortcuts import render, redirect, get_object_or_404
from django.urls import reverse_lazy
from rest_framework import generics, permissions
from core.forms import FeedbackForm
from .models import CareerToolkitAsset, VolunteerActivity, ActivitySignup, Feedback, Feedback
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
from .reports import get_event_stats, get_comparative_stats, get_or_create_ai_insight, get_detailed_quarterly_stats
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
        # Default: Get all events
        queryset = VolunteerActivity.objects.all().order_by('-date_time')
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

            # ✅ ADDED: Send ONE email for the entire series after the loop finishes
            if saved_activities:
                # You will need to import this new function at the top of your views.py
                send_series_event_email(saved_activities, original_title) 

            return Response(created_events_data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def perform_create(self, serializer):
        # Standard save hook
        activity = serializer.save(created_by=self.request.user)
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
            actual_hours = duration.total_seconds() / 3600

            # Failsafe max-cap just in case
            max_allowed = float(signup.activity.duration_hours or 0)
            final_hours = max_allowed if (max_allowed > 0 and actual_hours > max_allowed) else actual_hours

            signup.hours_earned = round(final_hours, 2)
            signup.sign_out_facilitator = request.user
            signup.attended = True
            signup.save()

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
        duration = signup.sign_out_time - signup.sign_in_time
        actual_hours = duration.total_seconds() / 3600
        
        # Cap hours at the max duration (just in case of weird data)
        max_allowed = float(activity.duration_hours)
        final_hours = min(actual_hours, max_allowed)
        
        signup.hours_earned = round(final_hours, 2)
        signup.sign_out_facilitator = request.user
        signup.attended = True
        signup.save()
        count += 1

    return Response({"message": f"Successfully signed out {count} students."})

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
        return VolunteerActivity.objects.filter(created_by=self.request.user).order_by('-date_time')

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
        ).order_by('-sign_out_time')[:5]
        
        events_list = [{
            'title': e.activity.title,
            'date': e.sign_out_time,
            'hours': e.hours_earned
        } for e in recent_events]

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
def quarterly_report_view(request):
    year = int(request.query_params.get('year', timezone.now().year))
    
    # Use the new detailed function
    report_data = get_detailed_quarterly_stats(year)
        
    return Response({"year": year, "data": report_data})


@api_view(['GET'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def download_report_pdf(request, pk):
    """
    Generates and downloads the PDF directly.
    """
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
        filename = f"Report_{stats['title'].replace(' ', '_')}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    return Response({"error": "PDF Generation Error"}, status=500)

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
    try:
        subject = f"Event Report: {stats['title']}"
        message = f"Please find attached the performance report for the event '{stats['title']}' held on {stats['date']}."
        email = EmailMessage(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL, # Ensure this is set in settings.py
            recipient_list
        )
        filename = f"Report_{stats['title'].replace(' ', '_')}.pdf"
        email.attach(filename, pdf, 'application/pdf')
        email.send()
        
        return Response({"message": f"Report sent to {len(recipient_list)} recipients."})
    except Exception as e:
        print(f"Email Error: {e}")
        return Response({"error": "Failed to send email."}, status=500)
    
@api_view(['GET'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def download_quarterly_pdf(request):
    year = int(request.query_params.get('year', timezone.now().year))
    report_data = get_detailed_quarterly_stats(year)
    
    data = {
        'year': year,
        'report_data': report_data
    }
    
    pdf = render_to_pdf('core/quarterly_pdf.html', data)
    
    if pdf:
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="Annual_Report_{year}.pdf"'
        return response
    return Response({"error": "PDF Generation Error"}, status=500)

@api_view(['POST'])
@permission_classes([IsAuthorizedExecutiveOrCoordinator])
def email_quarterly_pdf(request):
    year = int(request.data.get('year', timezone.now().year))
    emails_raw = request.data.get('emails', '')
    
    if not emails_raw:
        return Response({"error": "No email addresses provided."}, status=400)

    recipient_list = [e.strip() for e in emails_raw.split(',') if e.strip()]

    # Generate PDF
    report_data = get_detailed_quarterly_stats(year)
    data = {'year': year, 'report_data': report_data}
    pdf = render_to_pdf('core/quarterly_pdf.html', data)

    if not pdf:
        return Response({"error": "PDF Generation Failed"}, status=500)

    try:
        subject = f"Annual Volunteer Report: {year}"
        message = f"Please find attached the quarterly breakdown and campus performance report for the year {year}."
        email = EmailMessage(subject, message, settings.DEFAULT_FROM_EMAIL, recipient_list)
        email.attach(f"Annual_Report_{year}.pdf", pdf, 'application/pdf')
        email.send()
        return Response({"message": f"Yearly report sent to {len(recipient_list)} recipients."})
    except Exception as e:
        print(f"Email Error: {e}")
        return Response({"error": "Failed to send email."}, status=500)
    
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

            # Instantly return success to the frontend while emails send in the background
            return Response({"message": f"Announcement queued to send to {len(recipient_list)} recipient(s)."})

        except Exception as e:
            print(f"Announcement Queue Error: {e}")
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

            # 2. Package it up for the Javascript, adding the student's campus
            leaderboard_data.append({
                'first_name': student.first_name,
                'last_name': student.last_name,
                'campus': student.get_campus_display() if hasattr(student, 'get_campus_display') else "Unknown Campus", # 👈 Added Campus!
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
    
def quarterly_report_view(request):
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


client = OpenAI(api_key=getattr(settings, 'OPENAI_API_KEY', ''))

class CareerToolkitStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        
        # 1. Gather Verified Data (Same as before)
        stats = ActivitySignup.objects.filter(user=user, attended=True).aggregate(
            total_hours=Sum('hours_earned'),
            total_events=Count('id')
        )
        total_hours = round(float(stats['total_hours'] or 0.0) + float(getattr(user, 'manual_bonus_hours', 0.0)), 1)
        events_attended = stats['total_events'] or 0
        
        roles = "Peer Educator Volunteer"
        if getattr(user, 'executive_position', None):
            roles = f"{user.executive_position}, Peer Educator Volunteer"
            
        first_event = ActivitySignup.objects.filter(user=user, attended=True).order_by('sign_in_time').first()
        start_year = first_event.sign_in_time.year if first_event else timezone.now().year
        current_year = timezone.now().year
        years_active = f"{start_year} - Present" if start_year != current_year else f"{current_year}"

        # 2. Check Saved Assets & Staleness
        saved_assets = CareerToolkitAsset.objects.filter(user=user)
        asset_status = {
            'cv': {'exists': False, 'needs_update': False},
            'linkedin': {'exists': False, 'needs_update': False},
            'scholarship': {'exists': False, 'needs_update': False},
        }

        for asset in saved_assets:
            # Check if their current hours/events are higher than when the asset was generated
            needs_update = (total_hours > asset.hours_at_generation) or (events_attended > asset.events_at_generation)
            
            asset_status[asset.asset_type] = {
                'exists': True,
                'needs_update': needs_update,
                'content': asset.generated_content # Send the saved text!
            }

        return Response({
            "totalHours": total_hours,
            "eventsAttended": events_attended,
            "roles": roles,
            "yearsActive": years_active,
            "assetStatus": asset_status # <-- Pass the asset statuses to the frontend
        })
         
class CareerToolkitGenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        gen_type = request.data.get('type') 
        force_update = request.data.get('force_update', False) # True if user clicks "Update"
        user = request.user

        if gen_type not in ['cv', 'linkedin', 'scholarship']:
            return Response({"error": "Invalid generation type."}, status=status.HTTP_400_BAD_REQUEST)
        
        
        # 1. Re-fetch exact verified data to feed to OpenAI
        # Adjust 'ActivitySignup' and fields based on your actual model names
        stats = ActivitySignup.objects.filter(user=user, attended=True).aggregate(
            total_hours=Sum('hours_earned'),
            total_events=Count('id')
        )
        total_hours = round(float(stats['total_hours'] or 0.0) + float(getattr(user, 'manual_bonus_hours', 0.0)), 1)
        events_attended = stats['total_events'] or 0
        
        # --- 2. 10-HOUR RULE CHECK ---
        if force_update:
            existing_asset = CareerToolkitAsset.objects.filter(user=user, asset_type=gen_type).first()
            if existing_asset and total_hours < existing_asset.hours_at_generation + 10:
                needed_hours = existing_asset.hours_at_generation + 10
                return Response({
                    "error": f"You need to log at least 10 more hours to update this section to save system resources. Keep volunteering! (Current: {total_hours}h, Needed: {needed_hours}h)"
                }, status=status.HTTP_400_BAD_REQUEST)

        # 3. Rate Limiting (Max 5 generations per user per month)
        # We only count times we actually hit the OpenAI API
        thirty_days_ago = timezone.now() - timedelta(days=30)
        recent_generations = CareerToolkitAsset.objects.filter(user=user, last_updated__gte=thirty_days_ago).count()
        
        if force_update and recent_generations >= 5:
            return Response({"error": "You have reached the monthly limit for AI generations. Please try again next month."}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        roles = "Campus Peer Educator Volunteer"
        if getattr(user, 'executive_position', None):
            roles = f"{user.executive_position} & Peer Educator Volunteer"

        first_event = ActivitySignup.objects.filter(user=user, attended=True).order_by('sign_in_time').first()
        start_date = first_event.sign_in_time.strftime("%B %Y") if first_event else timezone.now().strftime("%B %Y")

        # Fetch completed courses from LMS
        from lms.models import StudentProgress
        completed_quizzes = StudentProgress.objects.filter(user=user, score=100.0).select_related('quiz')
        completed_courses = [progress.quiz.title for progress in completed_quizzes]
        completed_courses_str = ", ".join(completed_courses) if completed_courses else "None yet"

        # 3. Construct the Grounded Context Data
        volunteer_context = f"""
        Student Name: {user.first_name} {user.last_name}
        Organization: C-SHAW - Centre for Student Health and Wellness | University of Johannesburg
        Role(s) Held: {roles}
        Timeframe: {start_date} – Present
        Total Verified Hours: {total_hours} hours
        Total Events Attended: {events_attended} events
        Completed Training/Courses: {completed_courses_str}
        """

        # 4. Build Strict OpenAI Prompts
        system_prompt = (
            "You are a professional career coach helping a university student translate their verified "
            "volunteer data into highly professional career content. Write in a calm, grounded, and highly realistic tone. "
            "DO NOT exaggerate, use hyperbole, or sound like an AI chatbot. Base everything strictly on the provided facts. "
            "Use ONLY the data provided. Emphasize employability, leadership, and community impact realistically.\n"
            "CRITICAL INSTRUCTION: You MUST explicitly include and state the student's 'Total Verified Hours' "
            "somewhere in the generated text (e.g. within a bullet point or summary sentence).\n\n"
            "CRITICAL FORMATTING RULE: Do not use any markdown formatting. Do not use asterisks (**), "
            "underscores (_), or header hashes (#). Return pure, clean plaintext with normal line breaks."
        )

        if gen_type == 'cv':
            user_prompt = (
                f"Based on the following data, write a beautifully structured CV experience section.\n"
                f"Start with the Role Title, Organization Name, and Date Range on separate lines.\n"
                f"Follow with exactly 4 concise, action-oriented bullet points detailing the impact.\n"
                f"Use a standard literal bullet character (•) for each bullet point.\n\n"
                f"Data:\n{volunteer_context}"
            )
        
        elif gen_type == 'linkedin':
            user_prompt = f"Based on the following data, write a 2-paragraph professional LinkedIn summary in the first person. Separate the paragraphs with a single blank line. Do not include any title headers.\n\nData:\n{volunteer_context}"
        
        elif gen_type == 'scholarship':
            user_prompt = f"Based on the following data, draft a 3-paragraph application statement suitable for a scholarship or leadership program. Write in the first person. Separate paragraphs with a single blank line. Do not include headers.\n\nData:\n{volunteer_context}"

        # 6. Call OpenAI API (Using the v1.0.0+ syntax)
        try:
            response = client.chat.completions.create(
                model="gpt-3.5-turbo", 
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7, 
                max_tokens=400
            )
            
            # 1. Extract the text FIRST
            generated_text = response.choices[0].message.content.strip()
            
            # 2. THEN save it to the database
            asset, created = CareerToolkitAsset.objects.update_or_create(
                user=user,
                asset_type=gen_type,
                defaults={
                    'generated_content': generated_text,
                    'hours_at_generation': total_hours,
                    'events_at_generation': events_attended
                }
            )
            
            # 3. Return it to the frontend
            return Response({"content": generated_text})
            
        except Exception as e:
            return Response({"error": f"AI Generation failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CareerToolkitReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        # 1. Fetch Verified Data
        # Ensure 'ActivitySignup' matches your actual model name
        stats = ActivitySignup.objects.filter(user=user, attended=True).aggregate(
            total_hours=Sum('hours_earned'),
            total_events=Count('id')
        )
        total_hours = round(float(stats['total_hours'] or 0.0) + float(getattr(user, 'manual_bonus_hours', 0.0)), 1)
        events_attended = stats['total_events'] or 0
        
        roles = "Peer Educator Volunteer"
        if getattr(user, 'executive_position', None):
            roles = f"{user.executive_position}"

        first_event = ActivitySignup.objects.filter(user=user, attended=True).order_by('sign_in_time').first()
        start_year = first_event.sign_in_time.year if first_event else timezone.now().year
        current_year = timezone.now().year
        years_active = f"{start_year} - Present" if start_year != current_year else f"{current_year}"

        # 2. Setup the PDF Response
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="CSHAW_Impact_Report_{user.last_name}.pdf"'

        # 3. Create the PDF Canvas
        p = canvas.Canvas(response, pagesize=letter)
        width, height = letter

        # --- Define Brand Colors ---
        NAVY = colors.HexColor("#0f172a")
        ORANGE = colors.HexColor("#E35205")
        LIGHT_GREY = colors.HexColor("#f8fafc")
        BORDER_GREY = colors.HexColor("#e2e8f0")
        TEXT_MAIN = colors.HexColor("#1e293b")
        TEXT_MUTED = colors.HexColor("#64748b")

        # --- 1. HEADER (Deep Navy with Orange Accent) ---
        p.setFillColor(NAVY)
        p.rect(0, height - 110, width, 110, fill=1, stroke=0)
        
        # Orange Accent Line
        p.setFillColor(ORANGE)
        p.rect(0, height - 115, width, 5, fill=1, stroke=0)
        
        # Header Text
        p.setFillColor(colors.white)
        p.setFont("Helvetica-Bold", 24)
        p.drawString(40, height - 55, "OFFICIAL IMPACT REPORT")
        
        p.setFillColor(colors.HexColor("#cbd5e1"))
        p.setFont("Helvetica", 11)
        p.drawString(40, height - 80, "C-SHAW | Centre for Student Health and Wellness | University of Johannesburg")

        # --- 2. DOCUMENT META ---
        p.setFillColor(TEXT_MUTED)
        p.setFont("Helvetica", 10)
        p.drawString(40, height - 150, f"Issued: {timezone.now().strftime('%d %B %Y')}")
        p.drawString(40, height - 165, "Document Type: Verified Volunteer Record")

        # --- 3. STUDENT PROFILE BOX (Light Grey Rounded Rectangle) ---
        p.setFillColor(LIGHT_GREY)
        p.setStrokeColor(BORDER_GREY)
        p.roundRect(40, height - 280, width - 80, 90, radius=8, fill=1, stroke=1)

        # Profile Labels
        p.setFillColor(TEXT_MUTED)
        p.setFont("Helvetica-Bold", 9)
        p.drawString(60, height - 220, "VOLUNTEER NAME")
        p.drawString(260, height - 220, "PRIMARY ROLE")
        p.drawString(450, height - 220, "ACTIVE PERIOD")

        # Profile Values
        p.setFillColor(TEXT_MAIN)
        p.setFont("Helvetica-Bold", 14)
        p.drawString(60, height - 245, f"{user.first_name} {user.last_name}")

        p.setFont("Helvetica", 12)
        # Truncate role if it's too long to fit the box cleanly
        display_role = roles[:22] + "..." if len(roles) > 22 else roles
        p.drawString(260, height - 245, display_role)
        p.drawString(450, height - 245, str(years_active))

        # --- 4. THE METRICS DASHBOARD ---
        
        # Badge 1: Total Hours (Highlighted with Orange)
        p.setFillColor(colors.white)
        p.setStrokeColor(ORANGE)
        p.roundRect(40, height - 400, 240, 90, radius=8, fill=1, stroke=1)

        p.setFillColor(ORANGE)
        p.setFont("Helvetica-Bold", 32)
        p.drawString(60, height - 355, f"{total_hours}")
        
        p.setFillColor(TEXT_MAIN)
        p.setFont("Helvetica-Bold", 12)
        p.drawString(60, height - 380, "Total Verified Hours")

        # Badge 2: Events Attended
        p.setFillColor(colors.white)
        p.setStrokeColor(BORDER_GREY)
        p.roundRect(310, height - 400, width - 350, 90, radius=8, fill=1, stroke=1)

        p.setFillColor(NAVY)
        p.setFont("Helvetica-Bold", 32)
        p.drawString(330, height - 355, f"{events_attended}")
        
        p.setFillColor(TEXT_MUTED)
        p.setFont("Helvetica", 12)
        p.drawString(330, height - 380, "Events Supported")

        # --- 5. VERIFICATION FOOTER ---
        # A clean line above the footer
        p.setStrokeColor(BORDER_GREY)
        p.line(40, 70, width - 40, 70)

        p.setFillColor(TEXT_MUTED)
        p.setFont("Helvetica-Oblique", 9)
        p.drawString(40, 50, "This is an automated, official record generated by the C-SHAW Volunteer Management System.")
        p.drawString(40, 35, "All hours represented here have been actively verified by campus executives and clinic staff.")

        # Save and close the PDF
        p.showPage()
        p.save()

        return response
