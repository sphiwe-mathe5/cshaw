import logging
from .models import AuditLog

logger = logging.getLogger('core.audit')

# Sensitive keywords to filter from audit metadata
SENSITIVE_KEY_SUBSTRINGS = (
    'password',
    'token',
    'otp',
    'secret',
    'key',
    'credential',
    'auth',
    'cookie',
    'session',
    'card',
    'payment',
)

def _sanitize_metadata(data):
    """
    Recursively remove sensitive keys from metadata dictionaries before persisting.
    """
    if not isinstance(data, dict):
        return {}

    sanitized = {}
    for k, v in data.items():
        key_str = str(k).lower()
        if any(s in key_str for s in SENSITIVE_KEY_SUBSTRINGS):
            continue
        if isinstance(v, dict):
            sanitized[k] = _sanitize_metadata(v)
        elif isinstance(v, (list, tuple)):
            sanitized[k] = [
                _sanitize_metadata(item) if isinstance(item, dict) else item
                for item in v
            ]
        elif isinstance(v, (str, int, float, bool)) or v is None:
            sanitized[k] = v
        else:
            sanitized[k] = str(v)
    return sanitized

def log_audit_event(action, actor=None, target_type="", target_id="", metadata=None):
    """
    Record an immutable audit log entry for significant business events.
    
    :param action: String identifying the action (e.g. 'ATTENDANCE_VERIFIED', 'MANUAL_HOURS_ALLOCATED')
    :param actor: User instance or None (for system-initiated tasks)
    :param target_type: Entity name (e.g. 'ActivitySignup', 'User', 'VolunteerActivity')
    :param target_id: ID or key of target entity
    :param metadata: Dict of additional non-sensitive context
    :return: AuditLog instance or None
    """
    try:
        user_actor = None
        if actor and getattr(actor, 'is_authenticated', False):
            user_actor = actor

        clean_meta = _sanitize_metadata(metadata) if metadata else {}

        log_entry = AuditLog.objects.create(
            actor=user_actor,
            action=action,
            target_type=target_type or "",
            target_id=str(target_id) if target_id is not None else "",
            metadata=clean_meta,
        )
        logger.info(
            "AUDIT [%s] by %s on %s:%s",
            action,
            user_actor.email if user_actor else "SYSTEM",
            target_type,
            target_id
        )
        return log_entry
    except Exception as e:
        logger.error("Failed to record audit event '%s': %s", action, e, exc_info=True)
        return None
