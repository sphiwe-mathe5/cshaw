import os
from pathlib import Path
from google.oauth2 import service_account
from decouple import config, Csv
import dj_database_url


BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)
#ALLOWED_HOSTS = ['*']
ALLOWED_HOSTS = ['cshaw.co.za', 'www.cshaw.co.za']

OPENAI_API_KEY = config('OPENAI_API_KEY')
FIELD_ENCRYPTION_KEY = [config('FIELD_ENCRYPTION_KEY')]

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'storages',
    'corsheaders',
    'core',
    'users',
    'anymail',
    'lms',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',  
    'csp.middleware.CSPMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',  
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# CORS settings
CORS_ALLOW_CREDENTIALS = True
#CORS_ALLOWED_ORIGINS = [
#    'http://localhost:8000',
#    'http://127.0.0.1:8000',
#    'https://cshaw.co.za',
#    'https://www.cshaw.co.za',
#    'https://cshaw-production.up.railway.app',
#]

CORS_ALLOWED_ORIGINS = [
    'https://cshaw.co.za',
    'https://www.cshaw.co.za',
    'https://cshaw-production.up.railway.app',
]


AUTH_USER_MODEL = 'users.User'

AUTHENTICATION_BACKENDS = [

    'django.contrib.auth.backends.ModelBackend', 
]

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_ENGINE = 'django.contrib.sessions.backends.cached_db'

# Add cache configuration
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-session-cache',
    }
}

# Session and CSRF cookie settings
SESSION_COOKIE_NAME = 'sessionid'
SESSION_COOKIE_AGE = 1209600
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = False

# CSRF settings
CSRF_COOKIE_NAME = 'csrftoken'
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = False
CSRF_USE_SESSIONS = False
CSRF_TRUSTED_ORIGINS = [  
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'https://cshaw.co.za',
    'https://www.cshaw.co.za',
    'https://cshaw-production.up.railway.app',
]

SESSION_COOKIE_AGE = 86400  # 24 hours
SESSION_SAVE_EVERY_REQUEST = True
FILE_UPLOAD_MAX_MEMORY_SIZE = 10485760  # 10MB

# Django REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated', # 👈 Default to locked down!
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer', # 👈 Only return raw JSON, no web interface
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle'
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/day',  # Unregistered users can only make 100 requests a day
        'user': '1000/day'  # Logged in users can make 1000 a day
    }
}

# Keep the pretty web interface ONLY when you are on localhost
if DEBUG:
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'].append('rest_framework.renderers.BrowsableAPIRenderer')

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


DATABASES = {
    'default': dj_database_url.config(
        default='sqlite:///db.sqlite3',
        conn_max_age=600
    )
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]



# Internationalization
LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Africa/Johannesburg'

USE_I18N = True

USE_TZ = True


STATIC_URL = 'static/'
STATICFILES_DIRS = [os.path.join(BASE_DIR, "config/static")]
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"


DEFAULT_FILE_STORAGE = 'storages.backends.gcloud.GoogleCloudStorage'
GS_PROJECT_ID = config('GS_PROJECT_ID')
GS_BUCKET_NAME = config('GS_BUCKET_NAME')
MEDIA_URL = f'https://storage.googleapis.com/{GS_BUCKET_NAME}/' 

GS_CREDENTIALS = service_account.Credentials.from_service_account_info({
    "type": config("GOOGLE_CLOUD_TYPE", default="service_account"),
    "project_id": config("GOOGLE_CLOUD_PROJECT_ID"),
    "private_key_id": config("GOOGLE_CLOUD_PRIVATE_KEY_ID"),
    "private_key": config("GOOGLE_CLOUD_PRIVATE_KEY").replace("\\n", "\n"),
    "client_email": config("GOOGLE_CLOUD_CLIENT_EMAIL"),
    "client_id": config("GOOGLE_CLOUD_CLIENT_ID"),
    "auth_uri": config("GOOGLE_CLOUD_AUTH_URI", default="https://accounts.google.com/o/oauth2/auth"),
    "token_uri": config("GOOGLE_CLOUD_TOKEN_URI", default="https://oauth2.googleapis.com/token"),
    "auth_provider_x509_cert_url": config("GOOGLE_CLOUD_AUTH_PROVIDER_X509_CERT_URL", default="https://www.googleapis.com/oauth2/v1/certs"),
    "client_x509_cert_url": config("GOOGLE_CLOUD_CLIENT_X509_CERT_URL"),
    "universe_domain": config("GOOGLE_CLOUD_UNIVERSE_DOMAIN", default="googleapis.com")
})
GS_DEFAULT_ACL = 'publicRead'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Email configuration using Anymail with Postmark
EMAIL_BACKEND = "anymail.backends.postmark.EmailBackend"
ANYMAIL = {
    "POSTMARK_SERVER_TOKEN": config('EMAIL_HOST_PASSWORD'), 
}

# Construct the beautiful sender name
FROM_EMAIL_ADDRESS = 'info@cshaw.co.za'
DEFAULT_FROM_EMAIL = f"C-SHAW Hub <{FROM_EMAIL_ADDRESS}>"
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# Security settings
RECAPTCHA_SITE_KEY = config('RECAPTCHA_SITE_KEY')
RECAPTCHA_SECRET_KEY = config('RECAPTCHA_SECRET_KEY')

X_FRAME_OPTIONS = 'DENY'
CSRF_COOKIE_SAMESITE = 'Strict'
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

if not DEBUG:
    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_SSL_REDIRECT = True
    SECURE_REFERRER_POLICY = 'same-origin'
    SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
    SESSION_COOKIE_NAME = '__Host-sessionid'
    CSRF_COOKIE_NAME = '__Host-csrftoken'
    
else:
    CSRF_COOKIE_SECURE = False
    CSRF_COOKIE_HTTPONLY = False
    SESSION_COOKIE_SECURE = False
    SECURE_SSL_REDIRECT = False
    SECURE_HSTS_SECONDS = 0
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    
    
CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = (
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",  
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",
    "https://www.google.com",
    "https://www.gstatic.com",
)

CSP_STYLE_SRC = (
    "'self'", 
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
    "https://cdnjs.cloudflare.com",
)

CSP_FONT_SRC = (
    "'self'",
    "https://fonts.gstatic.com",
    "https://cdnjs.cloudflare.com",
)

CSP_IMG_SRC = (
    "'self'",
    "data:", 
    "https://*.googleusercontent.com", 

)

CSP_FORM_ACTION = ("'self'",)
CSP_FRAME_ANCESTORS = ("'self'",)
SECURE_CROSS_ORIGIN_RESOURCE_POLICY = "same-origin"
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
SESSION_COOKIE_AGE = 900
SESSION_SAVE_EVERY_REQUEST = True

LOGIN_URL = 'login-page'