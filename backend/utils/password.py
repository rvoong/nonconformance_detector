"""Password handling — plain text (no hashing). For production, replace with proper hashing."""
import hmac


def hash_password(plain: str) -> str:
    """Return the password as-is (no hashing)."""
    return plain


def verify_password(plain: str, stored: str) -> bool:
    """Return True if plain matches the stored value (constant-time comparison)."""
    return hmac.compare_digest(plain, stored)
