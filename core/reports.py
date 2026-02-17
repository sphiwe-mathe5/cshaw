import re
from django.db.models import Sum, Count, Q
from django.conf import settings
from openai import OpenAI
from .models import VolunteerActivity, ActivitySignup
from collections import defaultdict
from django.db.models import Q

client = OpenAI(api_key=settings.OPENAI_API_KEY)

def get_facilitator_stats(activity):
    """
    Returns a breakdown of who monitored the event.
    """
    # 1. Count Sign Ins per Facilitator
    sign_ins = ActivitySignup.objects.filter(activity=activity, sign_in_facilitator__isnull=False)\
        .values('sign_in_facilitator__first_name', 'sign_in_facilitator__last_name')\
        .annotate(count=Count('id')).order_by('-count')

    # 2. Count Sign Outs per Facilitator
    sign_outs = ActivitySignup.objects.filter(activity=activity, sign_out_facilitator__isnull=False)\
        .values('sign_out_facilitator__first_name', 'sign_out_facilitator__last_name')\
        .annotate(count=Count('id')).order_by('-count')

    return {
        "sign_ins": list(sign_ins),
        "sign_outs": list(sign_outs)
    }

def get_series_stats(current_activity):
    """
    If this event is part of a series (e.g. "Mass Testing (Day 1)"), 
    fetch simple stats for the OTHER days in the series to show retention/progress.
    """
    # Regex to strip "(Day X)" from the end of the title
    # Example: "Mass Testing (Day 1)" -> "Mass Testing"
    base_name_match = re.match(r"^(.*)\s\(Day\s\d+\)$", current_activity.title, re.IGNORECASE)
    
    if not base_name_match:
        return None # Not a series event

    base_name = base_name_match.group(1).strip()
    
    # Find all events at THIS campus with the SAME base name
    # Ordered by date so we see Day 1 -> Day 2 -> Day 3
    series_siblings = VolunteerActivity.objects.filter(
        title__startswith=base_name,
        campus=current_activity.campus,
        date_time__year=current_activity.date_time.year
    ).exclude(id=current_activity.id).order_by('date_time')

    series_data = []
    for sibling in series_siblings:
        # Get basic attendance count
        attended = ActivitySignup.objects.filter(activity=sibling, attended=True).count()
        series_data.append({
            "title": sibling.title,
            "date": sibling.date_time.strftime("%d %b"),
            "attended": attended,
            "spots": sibling.total_spots
        })

    return series_data if series_data else None

def get_event_stats(activity_id):
    activity = VolunteerActivity.objects.get(id=activity_id)
    signups = ActivitySignup.objects.filter(activity=activity, attended=True)
    total_signups = ActivitySignup.objects.filter(activity=activity).count()

    # 1. Basic Metrics
    attended_count = signups.count()
    attendance_rate = (attended_count / total_signups * 100) if total_signups > 0 else 0
    total_hours = signups.aggregate(Sum('hours_earned'))['hours_earned__sum'] or 0

    # 2. Punctuality (Same as before)
    early = 0
    late = 0
    on_time = 0
    for signup in signups:
        if signup.sign_in_time:
            diff = (signup.sign_in_time - activity.date_time).total_seconds() / 60
            if diff < -15: early += 1
            elif diff > 5: late += 1
            else: on_time += 1

    # 3. Facilitators (NEW)
    facilitators = get_facilitator_stats(activity)

    # 4. Series Context (NEW)
    series_stats = get_series_stats(activity)
    
    # 5. Campus Breakdown (For ALL events)
    campus_breakdown = {}
    if activity.campus == 'ALL':
        raw = signups.values('user__campus').annotate(count=Count('id'))
        for item in raw:
            campus_breakdown[item['user__campus']] = item['count']

    return {
        "title": activity.title,
        "date": activity.date_time.strftime("%Y-%m-%d"),
        "campus": activity.campus,
        "total_spots": activity.total_spots,
        "rsvp_count": total_signups,
        "attended_count": attended_count,
        "attendance_rate": round(attendance_rate, 1),
        "total_hours": float(total_hours),
        "punctuality": {"early": early, "on_time": on_time, "late": late},
        "campus_breakdown": campus_breakdown,
        "facilitators": facilitators,   # <--- Added
        "series_data": series_stats     # <--- Added
    }

def get_comparative_stats(activity_id):
    """
    Finds similar events at OTHER campuses (Cross-Campus).
    Smart Matching: If "Day 1", compare against "Day 1" at other campuses.
    """
    current_activity = VolunteerActivity.objects.get(id=activity_id)
    if current_activity.campus == 'ALL': return None

    # Logic: Search for Exact Title Match OR Base Name Match (if titles vary slightly)
    # But sticking to Exact Title (iexact) is usually safest for Cross-Campus comparisons
    # e.g. APB "Garden (Day 1)" vs DFC "Garden (Day 1)"
    
    siblings = VolunteerActivity.objects.filter(
        title__iexact=current_activity.title,
        date_time__year=current_activity.date_time.year
    ).exclude(id=current_activity.id).exclude(campus='ALL')

    comparison_data = []
    for sibling in siblings:
        stats = get_event_stats(sibling.id)
        comparison_data.append({
            "campus": sibling.campus,
            "date": stats['date'],
            "attendance_rate": stats['attendance_rate'],
            "total_hours": stats['total_hours'],
            "late_percentage": round((stats['punctuality']['late'] / stats['attended_count'] * 100), 1) if stats['attended_count'] else 0
        })
    return comparison_data
def get_detailed_quarterly_stats(year):
    # 1. Setup Structure
    quarters = {
        1: {"label": "Q1 (Jan-Mar)", "events": [], "campuses": defaultdict(lambda: {"rsvps": 0, "attended": 0, "ontime": 0})},
        2: {"label": "Q2 (Apr-Jun)", "events": [], "campuses": defaultdict(lambda: {"rsvps": 0, "attended": 0, "ontime": 0})},
        3: {"label": "Q3 (Jul-Sep)", "events": [], "campuses": defaultdict(lambda: {"rsvps": 0, "attended": 0, "ontime": 0})},
        4: {"label": "Q4 (Oct-Dec)", "events": [], "campuses": defaultdict(lambda: {"rsvps": 0, "attended": 0, "ontime": 0})},
    }

    # 2. Fetch Activities for the Year
    activities = VolunteerActivity.objects.filter(date_time__year=year).prefetch_related('signups__user')

    for activity in activities:
        # Determine Quarter (1-4)
        q_num = (activity.date_time.month - 1) // 3 + 1
        target_q = quarters[q_num]

        # A. Add to Event List
        target_q["events"].append({
            "title": activity.title,
            "date": activity.date_time.strftime("%d %b"),
            "campus": activity.campus
        })

        # B. Calculate Campus Stats (Iterate through students)
        signups = activity.signups.all()
        
        for signup in signups:
            # We track the STUDENT'S campus, not just the event campus
            # This handles "ALL" events correctly (APB students get credit for APB)
            student_campus = signup.user.campus if hasattr(signup.user, 'campus') else 'Unknown'
            
            stats = target_q["campuses"][student_campus]
            stats["rsvps"] += 1
            
            if signup.attended:
                stats["attended"] += 1
                
                # Check Punctuality (On Time = Not > 5 mins late)
                if signup.sign_in_time:
                    diff_mins = (signup.sign_in_time - activity.date_time).total_seconds() / 60
                    if diff_mins <= 5: 
                        stats["ontime"] += 1

    # 3. Format Data for Frontend (Calculate Percentages)
    final_report = []
    for q_num, data in quarters.items():
        campus_list = []
        for campus_name, metrics in data["campuses"].items():
            # Avoid division by zero
            att_rate = (metrics["attended"] / metrics["rsvps"] * 100) if metrics["rsvps"] > 0 else 0
            punc_rate = (metrics["ontime"] / metrics["attended"] * 100) if metrics["attended"] > 0 else 0
            
            campus_list.append({
                "name": campus_name,
                "rsvps": metrics["rsvps"],
                "attended": metrics["attended"],
                "attendance_rate": round(att_rate, 1),
                "punctuality_rate": round(punc_rate, 1)
            })
        
        # Sort Campuses by Attendance Rate (Leaderboard style)
        campus_list.sort(key=lambda x: x['attendance_rate'], reverse=True)

        final_report.append({
            "quarter": data["label"],
            "events": data["events"],
            "campus_stats": campus_list
        })

    return final_report
def get_or_create_ai_insight(activity, stats, comparison):
    if activity.ai_insight: return activity.ai_insight

    # Updated Prompt to include Facilitators and Series data
    series_text = ""
    if stats['series_data']:
        series_text = f"\nSeries Context: This is part of a multi-day event. Other days: {', '.join([d['title'] + ' (' + str(d['attended']) + ' attended)' for d in stats['series_data']])}."

    prompt = f"""
    Analyze this event: "{stats['title']}" ({stats['campus']}).
    
    Stats:
    - Attendance: {stats['attended_count']}/{stats['rsvp_count']} ({stats['attendance_rate']}%)
    - Punctuality: {stats['punctuality']['late']} late arrivals.
    {series_text}

    Comparison:
    {comparison if comparison else "No comparative data."}

    Write a 3-sentence summary for the coordinator. Mention if attendance is dropping (if series) or how it compares to other campuses.
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini", 
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150
        )
        text = response.choices[0].message.content.strip()
        activity.ai_insight = text
        activity.save()
        return text
    except Exception as e:
        print(f"OpenAI Error: {e}")
        return "Analysis unavailable."