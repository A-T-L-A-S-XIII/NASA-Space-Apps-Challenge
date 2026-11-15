from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import User, get_db
from app.schemas import LoginRequest, TokenResponse, UserCreate, UserOut
from app.security import create_access_token, get_current_user, require_gov, verify_password
from app.services.users import create_user, get_user_by_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _check_email_free(db: Session, email: str):
    if get_user_by_email(db, email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    _check_email_free(db, data.email)
    # Cadastro público SEMPRE cria cidadão, mesmo que o body mande outra role
    return create_user(db, data.name, data.email, data.password, role="cidadao", city=data.city)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = get_user_by_email(db, data.email)
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha incorretos")
    return TokenResponse(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/gov-users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_gov_user(data: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_gov)):
    _check_email_free(db, data.email)
    return create_user(db, data.name, data.email, data.password, role="governo", city=data.city)
