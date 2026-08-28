from datetime import datetime, timedelta, timezone
import asyncio
import secrets
import smtplib
import uuid
from email.message import EmailMessage

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.auth import create_access_token, hash_password, verify_password
from app.config import settings
from app.models.mongo import users

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class EmailRequest(BaseModel):
    email: EmailStr


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=20, max_length=10000)


class UserResponse(BaseModel):
    id: str
    name: str
    email: EmailStr


class AuthResponse(BaseModel):
    access_token: str | None = None
    token_type: str | None = None
    user: UserResponse | None = None
    verification_required: bool = False
    email: EmailStr | None = None
    message: str | None = None


class OtpSentResponse(BaseModel):
    message: str
    email: EmailStr


def _otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _is_expired(expires: datetime | None) -> bool:
    """Treat MongoDB's timezone-naive UTC datetimes as UTC."""
    if not expires:
        return True
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires < datetime.now(timezone.utc)


def _send_otp(email: str, code: str) -> None:
    if not all((settings.SMTP_HOST, settings.SMTP_USERNAME, settings.SMTP_PASSWORD, settings.SMTP_FROM_EMAIL)):
        raise RuntimeError("Email verification is not configured. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, and SMTP_FROM_EMAIL.")
    message = EmailMessage()
    message["Subject"] = "Your HOPEMO verification code"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = email
    message.set_content(f"Your HOPEMO verification code is {code}. It expires in {settings.OTP_EXPIRE_MINUTES} minutes. Do not share this code.")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=12) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(message)


async def _issue_otp(user: dict) -> None:
    code = _otp()
    await users.update_one({"_id": user["_id"]}, {"$set": {"verification_code": code, "verification_expires_at": datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)}})
    try:
        await asyncio.to_thread(_send_otp, user["email"], code)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest):
    user = {"_id": str(uuid.uuid4()), "name": request.name.strip(), "email": request.email.lower().strip(), "hashed_password": hash_password(request.password), "verified": False, "auth_provider": "password", "created_at": datetime.now(timezone.utc)}
    try:
        await users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account already exists for this email address.")
    await _issue_otp(user)
    return {"verification_required": True, "email": user["email"], "message": "We sent a six-digit verification code to your email address."}


@router.post("/verify-email", response_model=AuthResponse)
async def verify_email(request: VerifyEmailRequest):
    user = await users.find_one({"email": request.email.lower().strip()})
    if not user or user.get("verified"):
        raise HTTPException(status_code=400, detail="This verification request is no longer valid.")
    expires = user.get("verification_expires_at")
    if _is_expired(expires) or not secrets.compare_digest(str(user.get("verification_code", "")), request.code):
        raise HTTPException(status_code=400, detail="That verification code is invalid or expired.")
    await users.update_one({"_id": user["_id"]}, {"$set": {"verified": True, "verified_at": datetime.now(timezone.utc)}, "$unset": {"verification_code": "", "verification_expires_at": ""}})
    return {"access_token": create_access_token(user["_id"]), "token_type": "bearer", "user": {"id": user["_id"], "name": user["name"], "email": user["email"]}}


@router.post("/resend-verification", response_model=OtpSentResponse)
async def resend_verification(request: EmailRequest):
    user = await users.find_one({"email": request.email.lower().strip()})
    if not user:
        raise HTTPException(status_code=404, detail="No account was found for this email address.")
    if user.get("verified"):
        raise HTTPException(status_code=400, detail="This email is already verified.")
    await _issue_otp(user)
    return {"message": "Verification code sent.", "email": user["email"]}


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    user = await users.find_one({"email": request.email.lower().strip()})
    if not user or not user.get("hashed_password") or not verify_password(request.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password.")
    if not user.get("verified"):
        await _issue_otp(user)
        return {"verification_required": True, "email": user["email"], "message": "Verify your email to sign in. A new code has been sent."}
    return {"access_token": create_access_token(user["_id"]), "token_type": "bearer", "user": {"id": user["_id"], "name": user["name"], "email": user["email"]}}


@router.post("/google", response_model=AuthResponse)
async def google_login(request: GoogleLoginRequest):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google Sign-In is not configured yet.")
    try:
        info = await asyncio.to_thread(id_token.verify_oauth2_token, request.credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
    except Exception:
        raise HTTPException(status_code=401, detail="Google could not verify this sign-in. Please try again.")
    email = str(info.get("email", "")).lower().strip()
    google_id = str(info.get("sub", ""))
    if not email or not google_id or not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="Your Google account email could not be verified.")
    user = await users.find_one({"google_id": google_id}) or await users.find_one({"email": email})
    if not user:
        user = {"_id": str(uuid.uuid4()), "name": str(info.get("name") or email.split("@")[0])[:80], "email": email, "google_id": google_id, "verified": True, "auth_provider": "google", "created_at": datetime.now(timezone.utc)}
        await users.insert_one(user)
    elif not user.get("google_id"):
        await users.update_one({"_id": user["_id"]}, {"$set": {"google_id": google_id, "verified": True, "auth_provider": user.get("auth_provider", "password")}})
    return {"access_token": create_access_token(user["_id"]), "token_type": "bearer", "user": {"id": user["_id"], "name": user["name"], "email": user["email"]}}
