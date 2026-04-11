from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.database.models import Meeting, MeetingParticipant, FatigueLog, User
from app.auth.security import get_current_user, require_role
from app.meetings.schemas import (
    MeetingCreate,
    MeetingResponse,
    FatigueLogCreate,
    FatigueLogResponse,
)
from typing import List
import random, string

router = APIRouter(prefix="/meetings", tags=["Meetings"])


def generate_join_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


# ── Create a meeting (teachers only) ──────────────────────────────────────────
@router.post("/", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
def create_meeting(
    payload: MeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    # generate a unique join code
    while True:
        code = generate_join_code()
        if not db.query(Meeting).filter(Meeting.join_code == code).first():
            break

    meeting = Meeting(
        title=payload.title,
        host_id=current_user.id,
        join_code=code,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


# ── Join a meeting (any logged-in user) ───────────────────────────────────────
@router.post("/{join_code}/join", response_model=MeetingResponse)
def join_meeting(
    join_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.join_code == join_code).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.ended_at:
        raise HTTPException(status_code=400, detail="Meeting has already ended")

    # prevent duplicate joins
    already = db.query(MeetingParticipant).filter_by(
        meeting_id=meeting.id, user_id=current_user.id
    ).first()
    if not already:
        participant = MeetingParticipant(
            meeting_id=meeting.id,
            user_id=current_user.id,
        )
        db.add(participant)
        db.commit()

    db.refresh(meeting)
    return meeting


# ── Get meeting details (any participant or host) ──────────────────────────────
@router.get("/{meeting_id}", response_model=MeetingResponse)
def get_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


# ── End a meeting (host/teacher only) ─────────────────────────────────────────
@router.post("/{meeting_id}/end", response_model=MeetingResponse)
def end_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    import datetime
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can end this meeting")
    if meeting.ended_at:
        raise HTTPException(status_code=400, detail="Meeting already ended")

    meeting.ended_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(meeting)
    return meeting


# ── Submit a fatigue reading (any logged-in user) ─────────────────────────────
@router.post("/fatigue/log", response_model=FatigueLogResponse, status_code=status.HTTP_201_CREATED)
def log_fatigue(
    payload: FatigueLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting = db.query(Meeting).filter(Meeting.id == payload.meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.ended_at:
        raise HTTPException(status_code=400, detail="Cannot log to an ended meeting")
    if payload.fatigue_level not in ("low", "medium", "high"):
        raise HTTPException(status_code=422, detail="fatigue_level must be low, medium, or high")

    log = FatigueLog(
        user_id=current_user.id,
        meeting_id=payload.meeting_id,
        fatigue_level=payload.fatigue_level,
        ear_score=payload.ear_score,
        blink_rate=payload.blink_rate,
        head_pose=payload.head_pose,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ── Get all fatigue logs for a meeting (teachers only) ────────────────────────
@router.get("/{meeting_id}/fatigue", response_model=List[FatigueLogResponse])
def get_meeting_fatigue(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return db.query(FatigueLog).filter(FatigueLog.meeting_id == meeting_id).all()


# ── Get one user's fatigue logs in a meeting (teacher or the user themselves) ──
@router.get("/{meeting_id}/fatigue/{user_id}", response_model=List[FatigueLogResponse])
def get_user_fatigue(
    meeting_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "teacher" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    return db.query(FatigueLog).filter(
        FatigueLog.meeting_id == meeting_id,
        FatigueLog.user_id == user_id
    ).all()