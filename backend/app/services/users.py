from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import User
from app.security import hash_password


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def create_user(db: Session, name: str, email: str, password: str, role: str, city: str | None = None) -> User:
    user = User(
        name=name,
        email=email.lower(),
        password_hash=hash_password(password),
        role=role,
        city=city,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def ensure_seed_user(db: Session, name: str, email: str, password: str, role: str, city: str | None = None) -> None:
    """Cria uma conta semente se ela ainda não existir."""
    if get_user_by_email(db, email) is None:
        create_user(db, name=name, email=email, password=password, role=role, city=city)


def ensure_seed_gov(db: Session, name: str, email: str, password: str) -> None:
    """Cria a conta governo semente se ela ainda não existir."""
    ensure_seed_user(db, name, email, password, role="governo")
