from rest_framework import permissions

def check_scanner_access(user):
    """
    Validates whether a user is authorized to access the Ticket Scanner Dashboard
    and verify attendee passes (via QR code scanner or 6-digit PIN).
    
    Access Rules:
    1. Unauthenticated users -> Denied.
    2. Coordinators & Superusers -> Granted full access.
    3. Executives (user.is_executive == True):
       - Must have is_camp_eligible == True.
       - Must hold a Year-End Camp ticket (CampTicket).
       - If no ticket exists (didn't qualify) -> Denied.
       - If ticket is revoked/cancelled -> Denied.
       - If ticket is active or confirmed -> Granted scanning access.
    4. Regular students / non-executives -> Denied.
    """
    if not user or not user.is_authenticated:
        return False, "Authentication required to access the ticket scanner."

    if getattr(user, 'role', None) == 'COORDINATOR' or getattr(user, 'is_superuser', False):
        return True, ""

    if getattr(user, 'is_executive', False):
        if not getattr(user, 'is_camp_eligible', True):
            return False, "Access restricted: Your Year-End Camp eligibility has been revoked."

        from core.models import CampTicket
        exec_ticket = CampTicket.objects.filter(user=user).first()
        if not exec_ticket:
            return False, "Access restricted: Only executives who qualified and hold an active Year-End Camp ticket can access the ticket scanner."
        if exec_ticket.status == 'revoked':
            return False, "Access restricted: Your Year-End Camp ticket was cancelled or revoked. Only executives attending the camp can scan tickets."
        if exec_ticket.status in ['active', 'confirmed']:
            return True, ""

        return False, "Access restricted: Only executives attending the Year-End Camp can access the ticket scanner."

    return False, "Access to the Ticket Scanner is restricted strictly to C-SHAW Coordinators and attending Executives only."


class IsAuthorizedScannerUser(permissions.BasePermission):
    """
    DRF permission class for scanning API endpoints.
    Allows Coordinators and attending Executives.
    """
    def has_permission(self, request, view):
        allowed, _ = check_scanner_access(request.user)
        return allowed
