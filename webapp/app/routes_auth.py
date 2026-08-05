from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Header, status
from pydantic import BaseModel, Field
from app.database import get_db
from app.security import hash_password, verify_password, create_access_token, decode_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

class ChangeCredentialsRequest(BaseModel):
    current_password: Optional[str] = None
    new_username: str = Field(..., min_length=3, max_length=30)
    new_password: str = Field(..., min_length=8)

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization token"
        )
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired"
        )
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, must_change_password FROM users WHERE username = ?", (payload["sub"],))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists"
        )
    return dict(user)

@router.post("/login")
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (req.username,))
    user = cursor.fetchone()
    conn.close()

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    token = create_access_token({"sub": user["username"], "must_change_password": bool(user["must_change_password"])})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "must_change_password": bool(user["must_change_password"])
    }

@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return user

@router.post("/change-credentials")
def change_credentials(req: ChangeCredentialsRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE username = ?", (current_user["username"],))
    user = cursor.fetchone()

    # If user is not in forced password change mode, current_password must be verified
    is_first_run = bool(user["must_change_password"])
    if not is_first_run:
        if not req.current_password or not verify_password(req.current_password, user["password_hash"]):
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required and must be correct"
            )

    if req.new_username != current_user["username"]:
        cursor.execute("SELECT id FROM users WHERE username = ?", (req.new_username,))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New username is already in use"
            )

    new_hash = hash_password(req.new_password)
    cursor.execute("""
        UPDATE users 
        SET username = ?, password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (req.new_username, new_hash, current_user["id"]))
    conn.commit()
    conn.close()

    new_token = create_access_token({"sub": req.new_username, "must_change_password": False})
    return {
        "message": "Credentials changed successfully",
        "username": req.new_username,
        "must_change_password": False,
        "access_token": new_token,
        "token_type": "bearer"
    }
