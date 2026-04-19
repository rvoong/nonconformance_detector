from sqlalchemy.orm import Session

from db.models import User
from schemas.auth import LoginRequest, LoginResponse, UserInfo
from utils.password import verify_password

_INVALID_CREDENTIALS = "Invalid email or password"


def login(db: Session, payload: LoginRequest) -> LoginResponse:
    user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        return LoginResponse(success=False, message=_INVALID_CREDENTIALS)
    try:
        if not verify_password(payload.password, user.password_hash):
            return LoginResponse(success=False, message=_INVALID_CREDENTIALS)
    except Exception:
        return LoginResponse(success=False, message=_INVALID_CREDENTIALS)

    return LoginResponse(
        success=True,
        user=UserInfo(id=user.id, email=user.email),
    )


def logout(db: Session) -> None:
    # MVP: no token invalidation needed
    pass
