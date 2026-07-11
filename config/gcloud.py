from storages.backends.gcloud import GoogleCloudStorage
from django.conf import settings

# Custom storage class for media files
class GoogleCloudMediaFileStorage(GoogleCloudStorage):
    bucket_name = getattr(settings, 'GS_BUCKET_NAME', '')
    project_id = getattr(settings, 'GS_PROJECT_ID', '')

    default_acl = None 
    
    def url(self, name):
        """Returns the public URL for the file."""
        # Use the standard Google format
        name = name.lstrip('/')
        return f"https://storage.googleapis.com/{self.bucket_name}/{name}"