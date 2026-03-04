from storages.backends.gcloud import GoogleCloudStorage
from django.conf import settings

class GoogleCloudMediaFileStorage(GoogleCloudStorage):
    bucket_name = settings.GS_BUCKET_NAME
    project_id = settings.GS_PROJECT_ID
    # credentials = ... (Django storages handles this automatically from settings, no need to repeat)
    
    # 🛑 SECURITY FIX: 
    # Remove 'default_acl' because your bucket is "Uniform".
    # We will control access via the Cloud Console instead.
    default_acl = None 
    
    def url(self, name):
        """Returns the public URL for the file."""
        # Use the standard Google format
        name = name.lstrip('/')
        return f"https://storage.googleapis.com/{self.bucket_name}/{name}"