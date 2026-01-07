from rest_framework import permissions

class IsCoordinator(permissions.BasePermission):
    """
    Allows access only to Coordinators.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'COORDINATOR')