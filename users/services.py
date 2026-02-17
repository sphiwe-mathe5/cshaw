
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from .models import User
from django.core.mail import send_mass_mail, send_mail

def send_welcome_email(user, role_name):
    """
    Sends a multipart (HTML + Text) welcome email to the newly registered user.
    """
    subject = "Welcome to C-SHAW Hub! 🎉"
    login_url = "http://localhost:8000/login/" 
    
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
        
    except Exception as e:
        
        print(f"❌ Failed to send welcome email to {user.email}: {e}")


def send_new_event_email(activity):
    """
    Sends an email notification.
    - If event is for specific campus (e.g., 'APB'), only those students get it.
    - If event is 'ALL', everyone gets it.
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
        'link': "http://localhost:8000/" 
    }
    
    html_content = render_to_string('users/new_event_email.html', context)
    text_content = strip_tags(html_content)

    try:
        for email_addr in student_emails:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_content,  # Plain text fallback
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email_addr]
            )
            msg.attach_alternative(html_content, "text/html")  # Attach HTML version
            msg.send(fail_silently=True)
        
        print(f"✅ Sent email to {len(student_emails)} students.")
    except Exception as e:
        print(f"❌ Failed to send event emails: {e}")


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
        'dashboard_link': "http://localhost:8000/" 
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