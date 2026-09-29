import re
import logging
from collections import defaultdict
from django.db.models import Sum, Count, Q, Avg
from django.conf import settings
from django.utils import timezone
from openai import OpenAI
from .models import VolunteerActivity, ActivitySignup, Feedback

logger = logging.getLogger('core.reports')
client = OpenAI(api_key=settings.OPENAI_API_KEY)

def _calc_minutes_diff(t1, t2):
    if not t1 or not t2:
        return 0
    if timezone.is_aware(t1) and timezone.is_naive(t2):
        t2 = timezone.make_aware(t2)
    elif timezone.is_naive(t1) and timezone.is_aware(t2):
        t1 = timezone.make_aware(t1)
    return (t1 - t2).total_seconds() / 60

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
        if signup.sign_in_time and activity.date_time:
            diff = _calc_minutes_diff(signup.sign_in_time, activity.date_time)
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
        if not activity.date_time:
            continue
        # Determine Quarter (1-4)
        q_num = (activity.date_time.month - 1) // 3 + 1
        target_q = quarters.get(q_num)
        if not target_q:
            continue

        # A. Add to Event List
        target_q["events"].append({
            "title": activity.title or "Untitled Event",
            "date": activity.date_time.strftime("%d %b"),
            "campus": activity.campus or "Unknown"
        })

        # B. Calculate Campus Stats (Iterate through students)
        signups = activity.signups.all()
        
        for signup in signups:
            # We track the STUDENT'S campus, not just the event campus
            # This handles "ALL" events correctly (APB students get credit for APB)
            user = getattr(signup, 'user', None)
            student_campus = getattr(user, 'campus', None) if user else 'Unknown'
            if not student_campus:
                student_campus = 'Unknown'
            
            stats = target_q["campuses"][student_campus]
            stats["rsvps"] += 1
            
            if signup.attended:
                stats["attended"] += 1
                
                # Check Punctuality (On Time = Not > 5 mins late)
                if signup.sign_in_time and activity.date_time:
                    try:
                        diff_mins = _calc_minutes_diff(signup.sign_in_time, activity.date_time)
                        if diff_mins <= 5: 
                            stats["ontime"] += 1
                    except Exception:
                        pass

    # 3. Format Data for Frontend (Calculate Percentages)
    final_report = []
    for q_num, data in quarters.items():
        campus_list = []
        for campus_name, metrics in data["campuses"].items():
            # Avoid division by zero
            att_rate = (metrics["attended"] / metrics["rsvps"] * 100) if metrics["rsvps"] > 0 else 0
            punc_rate = (metrics["ontime"] / metrics["attended"] * 100) if metrics["attended"] > 0 else 0
            
            campus_list.append({
                "name": campus_name or "Unknown",
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

def get_annual_report_data(year):
    """
    Comprehensive data compilation for the Annual Performance & Impact Report.
    """
    from django.contrib.auth import get_user_model
    from lms.models import StudentProgress
    User = get_user_model()

    # 1. Quarterly Breakdown
    quarterly_stats = get_detailed_quarterly_stats(year)

    # 2. Executive KPIs
    attended_signups = ActivitySignup.objects.filter(
        activity__date_time__year=year,
        attended=True
    ).select_related('user', 'activity')

    all_signups = ActivitySignup.objects.filter(activity__date_time__year=year).select_related('user', 'activity')
    total_rsvps = all_signups.count()
    total_attended = attended_signups.count()

    total_event_hours_agg = attended_signups.aggregate(Sum('hours_earned'))['hours_earned__sum'] or 0
    
    # Include manual bonus hours for student volunteers (matching leaderboard & camp calculations)
    students_with_bonus = list(User.objects.filter(role=User.Roles.STUDENT, manual_bonus_hours__gt=0))
    total_bonus_hours = sum(float(u.manual_bonus_hours or 0.0) for u in students_with_bonus)
    total_hours = float(total_event_hours_agg) + total_bonus_hours

    active_user_ids = set(attended_signups.values_list('user_id', flat=True).distinct())
    bonus_user_ids = set(u.id for u in students_with_bonus)
    all_contributing_user_ids = active_user_ids.union(bonus_user_ids)
    unique_volunteers_count = len(all_contributing_user_ids)

    total_activities = VolunteerActivity.objects.filter(date_time__year=year).count()
    overall_attendance_rate = round((total_attended / total_rsvps * 100), 1) if total_rsvps > 0 else 0.0

    ontime_count = 0
    for s in attended_signups:
        if s.sign_in_time and s.activity.date_time:
            if _calc_minutes_diff(s.sign_in_time, s.activity.date_time) <= 5:
                ontime_count += 1
    overall_punctuality_rate = round((ontime_count / total_attended * 100), 1) if total_attended > 0 else 0.0

    # 3. Annual Campus Performance Matrix
    campus_totals = defaultdict(lambda: {'rsvps': 0, 'attended': 0, 'hours': 0.0, 'ontime': 0, 'users': set()})
    for s in all_signups:
        u = getattr(s, 'user', None)
        c_name = getattr(u, 'campus', None) or 'Unknown'
        campus_totals[c_name]['rsvps'] += 1
        if s.attended:
            campus_totals[c_name]['attended'] += 1
            campus_totals[c_name]['hours'] += float(s.hours_earned or 0.0)
            if u:
                campus_totals[c_name]['users'].add(u.id)
            if s.sign_in_time and s.activity.date_time:
                if _calc_minutes_diff(s.sign_in_time, s.activity.date_time) <= 5:
                    campus_totals[c_name]['ontime'] += 1

    # Include manual bonus hours into each campus total
    for u in students_with_bonus:
        c_name = getattr(u, 'campus', None) or 'Unknown'
        campus_totals[c_name]['hours'] += float(u.manual_bonus_hours or 0.0)
        campus_totals[c_name]['users'].add(u.id)

    annual_campus_stats = []
    for c_name, c_data in campus_totals.items():
        c_att_rate = round((c_data['attended'] / c_data['rsvps'] * 100), 1) if c_data['rsvps'] > 0 else 0.0
        c_punc_rate = round((c_data['ontime'] / c_data['attended'] * 100), 1) if c_data['attended'] > 0 else 0.0
        u_count = len(c_data['users'])
        avg_hrs = round((c_data['hours'] / u_count), 1) if u_count > 0 else 0.0
        annual_campus_stats.append({
            'name': c_name,
            'rsvps': c_data['rsvps'],
            'attended': c_data['attended'],
            'attendance_rate': c_att_rate,
            'total_hours': round(c_data['hours'], 1),
            'unique_volunteers': u_count,
            'avg_hours_per_volunteer': avg_hrs,
            'punctuality_rate': c_punc_rate,
        })
    annual_campus_stats.sort(key=lambda x: x['total_hours'], reverse=True)

    # 4. LMS Curriculum Capacity Building
    lms_progress = StudentProgress.objects.filter(completed_at__year=year)
    lms_quizzes_passed = lms_progress.count()
    avg_score_agg = lms_progress.aggregate(Avg('score'))['score__avg'] or 0.0
    certified_students_count = lms_progress.values('user_id').distinct().count()

    # 5. Top 5 Annual Honor Roll (Impact Leaders - includes event hours + manual bonus hours)
    user_hours_map = {}
    for s in attended_signups:
        u = s.user
        if u:
            if u.id not in user_hours_map:
                user_hours_map[u.id] = {
                    'hours': float(getattr(u, 'manual_bonus_hours', 0.0) or 0.0),
                    'events': 0,
                    'user': u
                }
            user_hours_map[u.id]['hours'] += float(s.hours_earned or 0.0)
            user_hours_map[u.id]['events'] += 1

    # Include any students who have manual bonus hours but 0 event signups this year
    for u in students_with_bonus:
        if u.id not in user_hours_map:
            user_hours_map[u.id] = {
                'hours': float(u.manual_bonus_hours or 0.0),
                'events': 0,
                'user': u
            }

    sorted_leaders = sorted(user_hours_map.values(), key=lambda x: x['hours'], reverse=True)[:5]
    top_leaders = []
    for rank, item in enumerate(sorted_leaders, 1):
        u = item['user']
        name = f"{u.first_name} {u.last_name}".strip() or u.email
        if rank == 1:
            title = "Gold Impact Leader (#1)"
        elif rank == 2:
            title = "Silver Impact Leader (#2)"
        elif rank == 3:
            title = "Bronze Impact Leader (#3)"
        else:
            title = f"Distinguished Leader (#{rank})"

        top_leaders.append({
            'rank': rank,
            'name': name,
            'campus': getattr(u, 'campus', 'Main Campus') or 'Main Campus',
            'hours': round(item['hours'], 1),
            'events_count': item['events'],
            'honor_title': title
        })

    # 6. Cohort Retention & Demographics
    active_users = User.objects.filter(id__in=all_contributing_user_ids)
    seniors_count = active_users.filter(volunteer_status='SENIOR').count()
    newcomers_count = active_users.filter(volunteer_status='NEWCOMER').count()

    # 7. Student Feedback & Sentiment
    feedback_qs = Feedback.objects.filter(created_at__year=year)
    feedback_count = feedback_qs.count()
    avg_rating = feedback_qs.aggregate(Avg('rating'))['rating__avg']
    avg_feedback_rating = round(float(avg_rating), 1) if avg_rating else 0.0

    report_date = timezone.now().strftime("%d %B %Y")

    return {
        'year': year,
        'report_date': report_date,
        'report_data': quarterly_stats,
        'kpis': {
            'total_hours': round(total_hours, 1),
            'active_volunteers': unique_volunteers_count,
            'total_campaigns': total_activities,
            'total_attendances': total_attended,
            'total_rsvps': total_rsvps,
            'overall_attendance_rate': overall_attendance_rate,
            'overall_punctuality_rate': overall_punctuality_rate,
        },
        'campus_matrix': annual_campus_stats,
        'lms_stats': {
            'quizzes_passed': lms_quizzes_passed,
            'avg_score': round(float(avg_score_agg), 1),
            'certified_students': certified_students_count,
        },
        'honor_roll': top_leaders,
        'demographics': {
            'seniors': seniors_count,
            'newcomers': newcomers_count,
        },
        'feedback': {
            'avg_rating': avg_feedback_rating,
            'total_reviews': feedback_count,
        }
    }


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
        logger.error("OpenAI Error generating insight: %s", e, exc_info=True)
        return "Analysis unavailable."