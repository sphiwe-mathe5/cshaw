import threading
import time
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from .models import User

class BackgroundEmailService:
    @staticmethod
    def _send_async(subject, to_emails, html_content, bcc_emails=None):
        """
        Internal helper: Handles the actual network request in the background.
        Automatically chunks large BCC lists to bypass Postmark's 50-recipient limit.
        """
        text_content = strip_tags(html_content)
        from_email = settings.DEFAULT_FROM_EMAIL

        def send():
            try:
                # 1. IF WE HAVE A LARGE LIST OF BCC EMAILS (Announcements, Mass Events)
                if bcc_emails:
                    batch_size = 45  # Postmark limit is 50. 45 gives us a safe buffer.
                    
                    for i in range(0, len(bcc_emails), batch_size):
                        batch_bcc = bcc_emails[i:i + batch_size]
                        
                        msg = EmailMultiAlternatives(
                            subject=subject,
                            body=text_content,
                            from_email=from_email,
                            to=to_emails, 
                            bcc=batch_bcc  # 👈 Pass the small batch here
                        )
                        msg.attach_alternative(html_content, "text/html")
                        msg.send(fail_silently=False)
                        
                        # Pause for a fraction of a second to respect API rate limits
                        time.sleep(0.2) 
                    
                    print(f"✅ Successfully sent: '{subject}' to {len(bcc_emails)} recipients in batches.")

                # 2. IF WE HAVE NO BCC EMAILS (Single Welcome Emails, RSVP Confirmations)
                else:
                    msg = EmailMultiAlternatives(
                        subject=subject,
                        body=text_content,
                        from_email=from_email,
                        to=to_emails
                    )
                    msg.attach_alternative(html_content, "text/html")
                    msg.send(fail_silently=False)
                    print(f"✅ Successfully sent: '{subject}' to {to_emails}")

            except Exception as e:
                print(f"❌ Background Email Error: {e}")

        # Standard thread (No daemon=True!)
        thread = threading.Thread(target=send)
        thread.start()


# 👇 Notice how we render the HTML first, THEN send the strings to the background 👇

def send_welcome_email(user, role_name):
    subject = "Welcome to C-SHAW Hub! 🎉"
    login_url = "https://cshaw.co.za/login/" 
    
    context = {
        'first_name': user.first_name,
        'role_name': role_name,
        'login_url': login_url
    }
    html_content = render_to_string('users/welcome_email.html', context)

    # Pass only strings to the background thread
    BackgroundEmailService._send_async(
        subject=subject,
        to_emails=[user.email],
        html_content=html_content
    )

def send_new_event_email(activity):
    subject = f"New Event: {activity.title} 📅"

    # 1. Do the Database lookups in the MAIN thread
    if activity.campus == 'ALL':
        students = User.objects.filter(role=User.Roles.STUDENT)
    else:
        students = User.objects.filter(role=User.Roles.STUDENT, campus=activity.campus)
    
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

    # 2. Use BCC to send ONE mass email instead of looping through hundreds of users!
    BackgroundEmailService._send_async(
        subject=subject,
        to_emails=[settings.DEFAULT_FROM_EMAIL], # Send to yourself
        bcc_emails=student_emails,               # Blind copy all students
        html_content=html_content
    )

def send_signup_confirmation_email(user, activity):
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

    BackgroundEmailService._send_async(
        subject=subject,
        to_emails=[user.email],
        html_content=html_content
    )
        
def send_series_event_email(activities, original_title):
    if not activities:
        return

    first_event = activities[0]
    last_event = activities[-1]
    campus = first_event.campus
    
    # DB Queries in the main thread
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
    subject = f"[C-SHAW] New Multi-Day Event: {original_title}"

    BackgroundEmailService._send_async(
        subject=subject,
        to_emails=[settings.DEFAULT_FROM_EMAIL],
        bcc_emails=recipients,
        html_content=html_content
    )