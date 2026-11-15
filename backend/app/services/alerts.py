"""Alertas publicados pelo governo para uma região ou uma cidade."""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import Alert, User
from app.services.users import get_user_by_email

# Criados no startup para a demonstração, sempre com source="demo"
DEMO_ALERTS = [
    {
        "region_id": "vale-do-taquari",
        "city_id": None,
        "level": "atencao",
        "title": "[Exemplo] Acompanhe o nível do Rio Taquari",
        "message": "Alerta de exemplo para demonstração do Water Waltz, não é um aviso real. "
                   "Em um alerta de verdade, a Defesa Civil explicaria aqui o que está acontecendo "
                   "e o que fazer.",
    },
    {
        "region_id": "vale-do-taquari",
        "city_id": "lajeado",
        "level": "alerta",
        "title": "[Exemplo] Chuva forte prevista para Lajeado",
        "message": "Alerta de exemplo para demonstração do Water Waltz, não é um aviso real. "
                   "Siga sempre as orientações oficiais da Defesa Civil (telefone 199).",
    },
]


def list_alerts(db: Session, region_id: str | None = None, city_id: str | None = None,
                only_active: bool = True) -> list[Alert]:
    """Mais recentes primeiro. Com city_id, inclui os alertas da região inteira (city_id vazio)."""
    query = select(Alert).order_by(Alert.created_at.desc(), Alert.id.desc())
    if region_id:
        query = query.where(Alert.region_id == region_id)
    if city_id:
        query = query.where(or_(Alert.city_id == city_id, Alert.city_id.is_(None)))
    if only_active:
        query = query.where(Alert.active.is_(True))
    return list(db.scalars(query))


def create_alert(db: Session, data: dict, user: User, source: str = "governo") -> Alert:
    alert = Alert(**data, created_by=user.id, source=source)
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def set_active(db: Session, alert: Alert, active: bool) -> Alert:
    alert.active = active
    db.commit()
    db.refresh(alert)
    return alert


def ensure_demo_alerts(db: Session, gov_email: str) -> None:
    """Cria os alertas de exemplo se ainda não existir nenhum alerta demo."""
    if db.scalar(select(Alert).where(Alert.source == "demo")) is not None:
        return
    gov = get_user_by_email(db, gov_email)
    if gov is None:
        return
    for data in DEMO_ALERTS:
        create_alert(db, data, gov, source="demo")
