from fastapi import Request, status
from fastapi.responses import JSONResponse

from core import exceptions


def make_exception_handler(status_code: int):
    """Returns a handler that responds with status_code and exc.detail for any AppException."""

    def handler(request: Request, exc: exceptions.AppException):
        return JSONResponse(
            status_code=status_code,
            content={"detail": exc.detail},
        )

    return handler


# All handlers use the same response shape; only status code differs.
project_not_found_handler = make_exception_handler(status.HTTP_404_NOT_FOUND)
anomaly_not_found_handler = make_exception_handler(status.HTTP_404_NOT_FOUND)
user_not_found_handler = make_exception_handler(status.HTTP_404_NOT_FOUND)
member_not_found_handler = make_exception_handler(status.HTTP_404_NOT_FOUND)
submission_not_found_handler = make_exception_handler(status.HTTP_404_NOT_FOUND)
permission_denied_handler = make_exception_handler(status.HTTP_403_FORBIDDEN)
conflict_error_handler = make_exception_handler(status.HTTP_409_CONFLICT)
invalid_state_transition_handler = make_exception_handler(status.HTTP_400_BAD_REQUEST)
