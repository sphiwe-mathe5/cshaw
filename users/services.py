import threading
from django.core.mail import EmailMultiAlternatives, send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from .models import User

# 👇 1. Create the Threading Decorator 👇
def send_in_background(function):
    """
    A decorator that runs the wrapped function in a separate background thread.
    This prevents email sending from blocking the main web request.
    """
    def wrapper(*args, **kwargs):
        thread = threading.Thread(target=function, args=args, kwargs=kwargs)
        thread.daemon = True # Allows the thread to exit if the main program exits
        thread.start()
    return wrapper

# 👇 2. Apply the decorator to all your email functions 👇

@send_in_background
def send_welcome_email(user, role_name):
    """
    Sends a multipart (HTML + Text) welcome email to the newly registered user.
    """
    subject = "Welcome to C-SHAW Hub! 🎉"
    
    # TIP: Consider changing localhost to your actual Railway domain in production!
    login_url = "https://cshaw.co.za/login/" 
    
    context = {
        'first_name': user.first_name,
        'role_name': role_name,
        'login_url': login_url
    }

    html_content = render_to_string('users/welcome_email.html', context)
    text_content = strip_tags(html_content)

    try:
        email = EmailMultiAlternatives(
            subject,
            text_content,           
            settings.DEFAULT_FROM_EMAIL,
            [user.email]            
        )
        email.attach_alternative(html_content, "text/html") 
        email.send()
        print(f"✅ Welcome email sent to {user.email}")
    except Exception as e:
        print(f"❌ Failed to send welcome email to {user.email}: {e}")


@send_in_background
def send_new_event_email(activity):
    """
    Sends an email notification.
    """
    subject = f"New Event: {activity.title} 📅"

    if activity.campus == 'ALL':
        students = User.objects.filter(role=User.Roles.STUDENT)
        print("📢 Sending email to ALL campuses.")
    else:
        students = User.objects.filter(role=User.Roles.STUDENT, campus=activity.campus)
        print(f"📢 Sending email only to {activity.campus} students.")
    
    student_emails = list(students.values_list('email', flat=True))

    if not student_emails:
        print("⚠️ No matching students found for email notification.")
        return 

    context = {
        'title': activity.title,
        'date': activity.date_time.strftime('%d %B %Y at %H:%M'),
        'location': activity.campus,
        'description': activity.description,
        'link': "https://cshaw.co.za/" 
    }
    
    html_content = render_to_string('users/new_event_email.html', context)
    text_content = strip_tags(html_content)

    try:
        for email_addr in student_emails:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_content,  
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email_addr]
            )
            msg.attach_alternative(html_content, "text/html")  
            msg.send(fail_silently=True)
        
        print(f"✅ Sent email to {len(student_emails)} students.")
    except Exception as e:
        print(f"❌ Failed to send event emails: {e}")


@send_in_background
def send_signup_confirmation_email(user, activity):
    """
    Sends a confirmation email to the student after they RSVP.
    """
    subject = f"You're Going! ✅ {activity.title}"
    
    context = {
        'name': user.first_name,
        'title': activity.title,
        'date': activity.date_time.strftime('%d %B %Y at %H:%M'),
        'location': activity.campus or f"{activity.campus} Campus",
        'description': activity.description,
        'dashboard_link': "https://cshaw.co.za/" 
    }
    
    html_content = render_to_string('users/signup_confirmation.html', context)
    text_content = strip_tags(html_content)

    try:
        send_mail(
            subject,
            text_content,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            html_message=html_content,
            fail_silently=True
        )
        print(f"✅ Confirmation email sent to {user.email}")
    except Exception as e:
        print(f"❌ Failed to send confirmation email: {e}")
        
        
@send_in_background
def send_series_event_email(activities, original_title):
    """
    Sends a single email summarizing a multi-day event series.
    """
    if not activities:
        return

    first_event = activities[0]
    last_event = activities[-1]
    campus = first_event.campus
    
    if campus == 'ALL':
        recipients = list(User.objects.filter(is_active=True).values_list('email', flat=True))
    else:
        recipients = list(User.objects.filter(campus=campus, is_active=True).values_list('email', flat=True))

    if not recipients:
        return

    context = {
        'title': original_title,
        'campus': campus,
        'description': first_event.description,
        'start_date': first_event.date_time.strftime('%d %b %Y'),
        'end_date': last_event.date_time.strftime('%d %b %Y'),
        'time': first_event.date_time.strftime('%H:%M'),
        'duration_hours': first_event.duration_hours,
        'total_spots': first_event.total_spots,
        'days_count': len(activities)
    }

    html_content = render_to_string('users/series_event.html', context)
    text_content = strip_tags(html_content)
    subject = f"[C-SHAW] New Multi-Day Event: {original_title}"

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[settings.DEFAULT_FROM_EMAIL],
            bcc=recipients
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send()
        print(f"✅ Sent series email to {len(recipients)} students.")
    except Exception as e:
        print(f"❌ Failed to send series email: {e}")