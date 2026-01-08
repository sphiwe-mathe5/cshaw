from django.shortcuts import render, redirect
from rest_framework import generics, permissions
from .models import VolunteerActivity, ActivitySignup
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .serializers import VolunteerActivitySerializer, ActivitySignupSerializer
from users.permissions import IsCoordinator # Import from your users app
from django.db.models import Sum, Count
from django.db.models.functions import ExtractMonth, ExtractYear


def index_page(request):
    return render(request, 'core/index.html')



# 1. List View (Public/Student can see events)
class ActivityListView(generics.ListAPIView):
    queryset = VolunteerActivity.objects.all().order_by('-date_time')
    serializer_class = VolunteerActivitySerializer
    permission_classes = [permissions.AllowAny] # Public can see "Upcoming Events"

# 2. Create View (Only Coordinators)
class ActivityCreateView(generics.CreateAPIView):
    queryset = VolunteerActivity.objects.all()
    serializer_class = VolunteerActivitySerializer
    permission_classes = [IsCoordinator] # Strict permission

    def perform_create(self, serializer):
        # Auto-assign the creator
        serializer.save(created_by=self.request.user)
    
# 3. Additional views like Detail, Update, Delete can be added similarly with appropriate permissions.
class ActivityDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = VolunteerActivity.objects.all()
    serializer_class = VolunteerActivitySerializer
    permission_classes = [IsCoordinator]

    def get_queryset(self):
        # Optional: Ensure coordinators can only edit/delete their OWN events
        # Remove this method if you want them to edit ANY event
        return VolunteerActivity.objects.filter(created_by=self.request.user)

# 4. Signup View (Students sign up for events)
class SignupCreateView(generics.CreateAPIView):
    serializer_class = ActivitySignupSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        # 1. Get the activity from request data
        activity_id = self.request.data.get('activity')
        
        # 2. Check if already signed up
        if ActivitySignup.objects.filter(user=self.request.user, activity_id=activity_id).exists():
            raise ValidationError("You have already signed up for this event.")

        # 3. Check spots availability (Optional but good practice)
        activity = VolunteerActivity.objects.get(pk=activity_id)
        if activity.spots_left <= 0:
            raise ValidationError("Sorry, this event is fully booked.")

        # 4. Save
        serializer.save(user=self.request.user)
        
        # 5. Update the main activity counters
        activity.spots_taken += 1
        activity.save()

class AttendanceActionView(APIView):
    permission_classes = [IsCoordinator]

    def post(self, request, pk):
        """
        pk: The ID of the Signup (ActivitySignup), NOT the user or activity.
        Action: 'signin' or 'signout' passed in body.
        """
        action = request.data.get('action')
        
        try:
            signup = ActivitySignup.objects.get(pk=pk)
        except ActivitySignup.DoesNotExist:
            return Response({"error": "Signup not found"}, status=status.HTTP_404_NOT_FOUND)

        if action == 'signin':
            if signup.sign_in_time:
                return Response({"error": "Student already signed in."}, status=status.HTTP_400_BAD_REQUEST)
            
            # Record Start Time
            signup.sign_in_time = timezone.now()
            signup.save()
            return Response({"message": "Signed In", "time": signup.sign_in_time})

        elif action == 'signout':
            if not signup.sign_in_time:
                return Response({"error": "Cannot sign out. Student never signed in."}, status=status.HTTP_400_BAD_REQUEST)
            if signup.sign_out_time:
                return Response({"error": "Student already signed out."}, status=status.HTTP_400_BAD_REQUEST)

            # Record End Time
            signup.sign_out_time = timezone.now()
            
            # CALCULATE DURATION
            # Result is a timedelta
            duration = signup.sign_out_time - signup.sign_in_time
            
            # Convert to hours (e.g., 1.5 hours)
            total_seconds = duration.total_seconds()
            hours = round(total_seconds / 3600, 2) # Round to 2 decimal places
            
            signup.hours_earned = hours
            signup.attended = True # Mark as officially attended
            signup.save()
            
            return Response({
                "message": "Signed Out", 
                "time": signup.sign_out_time,
                "hours": hours
            })

        return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
    
class EventRSVPListView(generics.ListAPIView):
    serializer_class = ActivitySignupSerializer
    permission_classes = [IsCoordinator]

    def get_queryset(self):
        # Filter by the activity_id passed in the URL
        activity_id = self.kwargs['activity_id']
        return ActivitySignup.objects.filter(activity_id=activity_id).select_related('user', 'selected_role')
    


class StudentStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        TARGET_HOURS = 80.00
        
        # 1. Total Stats
        stats = ActivitySignup.objects.filter(user=user, attended=True).aggregate(
            total_hours=Sum('hours_earned'),
            total_events=Count('id')
        )
        total_hours = float(stats['total_hours'] or 0.00)
        events_count = stats['total_events'] or 0

        # 2. Motivation Logic
        remaining = max(0, TARGET_HOURS - total_hours)
        progress_percent = min(100, (total_hours / TARGET_HOURS) * 100)
        
        if total_hours >= 80:
            motivation = "🌟 Incredible! You've reached the 80-hour goal. You are a Super Volunteer!"
        elif total_hours >= 60:
            motivation = "🔥 You are on fire! Just a final push to the finish line."
        elif total_hours >= 40:
            motivation = "🚀 Halfway there! Your consistency is inspiring."
        elif total_hours >= 10:
            motivation = "👍 Great start! Keep the momentum going."
        else:
            motivation = "👋 Welcome! Every hour counts, let's get started."

        # 3. Calculate Rank (Position)
        # Count how many users have MORE hours than current user
        # (This is a simplified ranking, adequate for this stage)
        user_hours_map = ActivitySignup.objects.filter(attended=True).values('user').annotate(
            hours=Sum('hours_earned')
        )
        # Find current user's rank
        rank = 1
        for u in user_hours_map:
            if float(u['hours']) > total_hours:
                rank += 1

        # 4. Monthly Breakdown (For the first card)
        # Group by Year/Month
        monthly_data = ActivitySignup.objects.filter(user=user, attended=True).annotate(
            month=ExtractMonth('sign_out_time'),
            year=ExtractYear('sign_out_time')
        ).values('month', 'year').annotate(
            hours=Sum('hours_earned')
        ).order_by('-year', '-month')[:5] # Last 5 months

        # Convert month numbers to names (1 -> January)
        import calendar
        formatted_months = []
        for item in monthly_data:
            month_name = calendar.month_name[item['month']]
            formatted_months.append({
                'name': month_name,
                'hours': item['hours']
            })

        # 5. Recent Events (For the middle card)
        recent_events = ActivitySignup.objects.filter(user=user, attended=True).order_by('-sign_out_time')[:5]
        events_list = [{
            'title': e.activity.title,
            'date': e.sign_out_time,
            'hours': e.hours_earned
        } for e in recent_events]

        return Response({
            "total_hours": total_hours,
            "events_count": events_count,
            "target": TARGET_HOURS,
            "remaining": remaining,
            "progress_percent": progress_percent,
            "motivation": motivation,
            "rank": rank,
            "monthly": formatted_months,
            "history": events_list
        })