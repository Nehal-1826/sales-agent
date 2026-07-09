"""Pydantic v2 schemas for authentication endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def _password_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("password must not be blank")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until access token expiry


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    role: str
    onboarding_status: str
    workspace_id: uuid.UUID
    plan: str | None = None
    crm_addon: bool = False
    totp_enabled: bool
    email_verified: bool = False
    created_at: datetime


class AuthResponse(BaseModel):
    tokens: TokenPair
    user: UserResponse


class TotpSetupResponse(BaseModel):
    secret: str
    qr_provisioning_uri: str


class TotpVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class GoogleCallbackResponse(BaseModel):
    access_token: str
    id_token: str | None = None
    refresh_token: str | None = None
    expires_in: int | None = None
    scope: str | None = None
    token_type: str | None = None
