class AppException(Exception):
    """Base class for all application exceptions. Supports an optional detail message."""
    default_detail: str = "An unexpected error occurred"

    def __init__(self, detail: str | None = None):
        self.detail = detail or self.default_detail


# -------------------------
# Not Found
# -------------------------
class ProjectNotFound(AppException):
    default_detail = "Project not found"


class AnomalyNotFound(AppException):
    default_detail = "Anomaly not found"


class UserNotFound(AppException):
    default_detail = "User not found"


class MemberNotFound(AppException):
    default_detail = "Member not found"


class SubmissionNotFound(AppException):
    default_detail = "Submission not found"


# -------------------------
# Auth / Permissions
# -------------------------
class PermissionDenied(AppException):
    default_detail = "You do not have permission to perform this action"


# -------------------------
# Conflict
# -------------------------
class ConflictError(AppException):
    default_detail = "A conflict occurred"


class AlreadyMember(ConflictError):
    default_detail = "User is already a member of this project"


# -------------------------
# State
# -------------------------
class InvalidStateTransition(AppException):
    default_detail = "Invalid state transition"