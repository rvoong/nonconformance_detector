import uuid
from db.models import User
from utils.password import hash_password


def make_user(
    db,
    email: str = "test@example.com",
    password: str = "password123",
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.flush()  # ← flush instead of commit
    db.refresh(user)
    return user