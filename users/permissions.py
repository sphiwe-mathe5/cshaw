from rest_framework import permissions

class IsCoordinator(permissions.BasePermission):
    """
    Allows access only to Coordinators.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'COORDINATOR')
    

class IsAuthorizedExecutiveOrCoordinator(permissions.BasePermission):
    """
    Allows access to Coordinators OR Executives who have 'can_manage_attendance' = True.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
            
        is_coordinator = request.user.role == 'COORDINATOR'
        is_auth_exec = (request.user.role == 'STUDENT' and 
                        request.user.is_executive and 
                        request.user.can_manage_attendance)
        
        return is_coordinator or is_auth_exec