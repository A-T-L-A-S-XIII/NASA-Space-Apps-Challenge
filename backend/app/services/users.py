import logging

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


GOV_PASSWORD_MIN_LENGTH = 8
# Senhas que já circularam no código ou na documentação
KNOWN_WEAK_PASSWORDS = {"troque-esta-senha", "senha123", "password"}

log = logging.getLogger(__name__)


def ensure_seed_gov(db: Session, name: str, email: str, password: str) -> bool:
    """Cria a conta governo semente se ela ainda não existir.

    Sem SEED_GOV_PASSWORD, ou com uma senha fraca ou conhecida, a conta NÃO é criada: é a única
    conta que cria alertas, e a senha padrão antiga é pública. A API sobe normalmente sem ela.
    """
    if get_user_by_email(db, email) is not None:
        return True
    if not password or password in KNOWN_WEAK_PASSWORDS or len(password) < GOV_PASSWORD_MIN_LENGTH:
        log.warning("Conta governo semente não criada: defina SEED_GOV_PASSWORD (%d+ caracteres, não um valor "
                    "de exemplo) se precisar dela.", GOV_PASSWORD_MIN_LENGTH)
        return False
    ensure_seed_user(db, name, email, password, role="governo")
    return True
