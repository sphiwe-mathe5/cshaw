from django.shortcuts import render, redirect, get_object_or_404
from rest_framework import generics, permissions
from .models import VolunteerActivity, ActivitySignup
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .serializers import VolunteerActivitySerializer, ActivitySignupSerializer, ActivityRSVPSerializer, ActivitySerializer
from users.permissions import IsCoordinator 
from django.db.models import Sum, Count
from django.db.models.functions import ExtractMonth, ExtractYear
import calendar
from users.services import send_new_event_email, send_signup_confirmation_email 


def index_page(request):
    return render(request, 'core/index.html')

def about_page(request):
    return render(request, 'core/about.html')

def privacy(request):
    return render(request, 'core/privacy.html')

def terms(request):
    return render(request, 'core/terms.html')


class ActivityListView(generics.ListAPIView):
    queryset = VolunteerActivity.objects.all().order_by('-date_time')
    serializer_class = VolunteerActivitySerializer
    permission_classes = [permissions.AllowAny] 

class ActivityCreateView(generics.CreateAPIView):
    queryset = VolunteerActivity.objects.all()
    serializer_class = VolunteerActivitySerializer 
    permission_classes = [IsCoordinator]

    def perform_create(self, serializer):
        activity = serializer.save(created_by=self.request.user)
        send_new_event_email(activity)
    

class ActivityDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = VolunteerActivity.objects.all()
    serializer_class = VolunteerActivitySerializer
    permission_classes = [IsCoordinator]

    def get_queryset(self):
        return VolunteerActivity.objects.filter(created_by=self.request.user)


class SignupCreateView(generics.CreateAPIView):
    serializer_class = ActivitySignupSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        user = self.request.user
        activity_id = self.request.data.get('activity')
        role_ids = self.request.data.get('selected_roles', [])
        activity = get_object_or_404(VolunteerActivity, pk=activity_id)

        if activity.campus != 'ALL' and activity.campus != user.campus:
            raise ValidationError(
                f"You cannot RSVP for {activity.campus} events. You are registered at {user.campus}."
            )
        
        if ActivitySignup.objects.filter(user=user, activity_id=activity_id).exists():
            raise ValidationError("You have already signed up for this event.")
        
        if activity.spots_left <= 0:
            raise ValidationError("Sorry, this event is fully booked.")
        
        signup_instance = serializer.save(user=user)

        if role_ids:
            valid_roles = activity.roles.filter(id__in=role_ids)
            signup_instance.roles.set(valid_roles)

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

class AttendanceActionView(APIView):
    permission_classes = [IsCoordinator] 

    def post(self, request, pk):
        action = request.data.get('action')

        try:
            signup = ActivitySignup.objects.get(pk=pk)
        except ActivitySignup.DoesNotExist:
            return Response({"error": "Signup not found"}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        event_start = signup.activity.date_time

        if action == 'signin':
            if signup.sign_in_time:
                return Response({"error": "Student already signed in."}, status=status.HTTP_400_BAD_REQUEST)
            
            if now.date() != event_start.date():
                 return Response({
                     "error": f"Cannot sign in. This event is on {event_start.strftime('%d %B')}."
                 }, status=status.HTTP_400_BAD_REQUEST)

            if now < event_start:
                return Response({
                    "error": f"Event hasn't started yet. Starts at {event_start.strftime('%H:%M')}."
                }, status=status.HTTP_400_BAD_REQUEST)

            signup.sign_in_time = now
            signup.save()
            return Response({"message": "Signed In", "time": signup.sign_in_time})

        elif action == 'signout':
            if not signup.sign_in_time:
                return Response({"error": "Cannot sign out. Student never signed in."}, status=status.HTTP_400_BAD_REQUEST)
            
            if signup.sign_out_time:
                return Response({"error": "Student already signed out."}, status=status.HTTP_400_BAD_REQUEST)

            signup.sign_out_time = now
            
            duration = signup.sign_out_time - signup.sign_in_time
            total_seconds = duration.total_seconds()
            
            actual_hours = total_seconds / 3600
            
            max_allowed = float(signup.activity.duration_hours or 0)

            if max_allowed > 0 and actual_hours > max_allowed:
                final_hours = max_allowed
                print(f"⚠️ Capped hours for {signup.user}: Actual {actual_hours:.2f} -> Capped {final_hours}")
            else:
                final_hours = actual_hours

            signup.hours_earned = round(final_hours, 2)
            signup.attended = True
            signup.save()
            
            return Response({
                "message": "Signed Out", 
                "time": signup.sign_out_time,
                "hours": signup.hours_earned
            })

        return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
    
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
        
        total_hours = float(stats['total_hours'] or 0.00)
        events_count = stats['total_events'] or 0
        
        remaining = max(0, TARGET_HOURS - total_hours)
        progress_percent = min(100, (total_hours / TARGET_HOURS) * 100)
        
        if total_hours >= 80:
            motivation = f"🌟 Incredible! You've reached the {current_year} goal. You are a Super Volunteer!"
        elif total_hours >= 40:
            motivation = "🚀 Halfway there! Keep consistency for this year's record."
        elif total_hours >= 10:
            motivation = f"👍 Great start to {current_year}! Keep the momentum going."
        else:
            motivation = f"👋 Welcome to {current_year}! Let's start logging those hours."

        recruits_count = user.recruits.count()

        user_hours_map = ActivitySignup.objects.filter(
            attended=True,
            sign_out_time__year=current_year 
        ).values('user').annotate(
            hours=Sum('hours_earned')
        ).order_by('-hours')
        
        rank = 1
        for u in user_hours_map:
            
            if float(u['hours']) > total_hours:
                rank += 1
        
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
        awards_data = [
            {'name': a.name, 'icon': a.icon, 'color': a.color} 
            for a in user_awards
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
            "current_year": current_year, 
            "total_hours": total_hours,
            "events_count": events_count,
            "recruits_count": recruits_count,
            "target": TARGET_HOURS,
            "remaining": remaining,
            "progress_percent": progress_percent,
            "motivation": motivation,
            "rank": rank,
            "monthly": formatted_months,
            "history": events_list,
            "awards": awards_data,
            "executive_position": user.executive_position,
        })