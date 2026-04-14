from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.database.models import Meeting, MeetingParticipant, FatigueLog, User
from app.auth.security import get_current_user, require_role
from app.core.utils import get_ist_time
from app.meetings.schemas import (
    MeetingCreate,
    MeetingResponse,
    FatigueLogCreate,
    FatigueLogResponse,
    AttendanceResponse,
    SessionInfo,
)
from app.websockets.manager import manager
import datetime
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

    # unconditional join for multi-session tracking
    participant = MeetingParticipant(
        meeting_id=meeting.id,
        user_id=current_user.id,
    )
    db.add(participant)
    db.commit()

    db.refresh(meeting)
    meeting.user_joined_at = participant.joined_at
    return meeting


# ── Get all meetings for user (Teacher or Student) ─────────────────────────────
@router.get("/", response_model=List[MeetingResponse])
def get_all_meetings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "teacher":
        return db.query(Meeting).filter(Meeting.host_id == current_user.id).order_by(Meeting.started_at.desc()).all()
    else:
        # For students, find their latest session join time for each meeting
        meetings = db.query(Meeting).join(MeetingParticipant).filter(
            MeetingParticipant.user_id == current_user.id
        ).order_by(Meeting.started_at.desc()).all()
        
        for m in meetings:
            latest_part = db.query(MeetingParticipant).filter(
                MeetingParticipant.meeting_id == m.id,
                MeetingParticipant.user_id == current_user.id
            ).order_by(MeetingParticipant.joined_at.desc()).first()
            if latest_part:
                m.user_joined_at = latest_part.joined_at
        return meetings


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
    
    # Populate user_joined_at for the current user
    latest_part = db.query(MeetingParticipant).filter(
        MeetingParticipant.meeting_id == meeting_id,
        MeetingParticipant.user_id == current_user.id
    ).order_by(MeetingParticipant.joined_at.desc()).first()
    if latest_part:
        meeting.user_joined_at = latest_part.joined_at

    return meeting


# ── End a meeting (host/teacher only) ─────────────────────────────────────────
@router.post("/{meeting_id}/end", response_model=MeetingResponse)
def end_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can end this meeting")
    if meeting.ended_at:
        raise HTTPException(status_code=400, detail="Meeting already ended")

    meeting.ended_at = get_ist_time()
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


# ── Leave a meeting (idempotent) ──────────────────────────────────────────
@router.post("/{meeting_id}/leave")
def leave_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Find most recent open session
    participant = db.query(MeetingParticipant).filter(
        MeetingParticipant.meeting_id == meeting_id,
        MeetingParticipant.user_id == current_user.id,
        MeetingParticipant.left_at == None
    ).order_by(MeetingParticipant.joined_at.desc()).first()

    if participant:
        participant.left_at = get_ist_time()
        db.commit()
    
    return {"status": "ok"}


# ── Get attendance (teachers only) ──────────────────────────────────────────
@router.get("/{meeting_id}/attendance", response_model=List[AttendanceResponse])
def get_meeting_attendance(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("teacher")),
):
    participants = db.query(MeetingParticipant, User).join(User).filter(
        MeetingParticipant.meeting_id == meeting_id
    ).order_by(MeetingParticipant.joined_at.asc()).all()

    # Group by user_id
    grouped = {}
    for p, u in participants:
        if u.id not in grouped:
            grouped[u.id] = {
                "user_id": u.id,
                "name": u.name,
                "email": u.email,
                "sessions": [],
                "first_seen": p.joined_at
            }
        
        grouped[u.id]["sessions"].append({
            "joined_at": p.joined_at,
            "left_at": p.left_at
        })

    results = []
    now = get_ist_time()
    for uid, data in grouped.items():
        total_minutes = 0
        for s in data["sessions"]:
            start = s["joined_at"]
            end = s["left_at"] or now
            duration = (end - start).total_seconds() / 60
            total_minutes += max(0, int(duration))
        
        data["total_minutes"] = total_minutes
        results.append(data)

    return results


# ── Live Active Student Count (no auth) ──────────────────────────────────────
@router.get("/{meeting_id}/active-count")
def get_active_count(meeting_id: int):
    count = len(manager.active_connections.get(meeting_id, []))
    return { "meeting_id": meeting_id, "active_count": count }