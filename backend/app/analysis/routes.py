import base64
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import Meeting, FatigueLog, User
from app.auth.security import get_current_user
from app.services.vision import extract_features
from app.services import ml as ml_service
from app.analysis.schemas import AnalyzeRequest, AnalyzeResponse

router = APIRouter(prefix="/analyze", tags=["Analysis"])


@router.post("/", response_model=AnalyzeResponse, status_code=status.HTTP_201_CREATED)
def analyze_frame(
    payload: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Validate meeting
    meeting = db.query(Meeting).filter(Meeting.id == payload.meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.ended_at:
        raise HTTPException(status_code=400, detail="Cannot analyze frames for an ended meeting")

    # 2. Decode base64 image
    try:
        image_bytes = base64.b64decode(payload.frame)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid base64 image data")

    # 3. Run MediaPipe feature extraction
    features = extract_features(image_bytes)
    if features is None:
        # No face detected — log as low, return gracefully
        log = FatigueLog(
            user_id=current_user.id,
            meeting_id=payload.meeting_id,
            fatigue_level="low",
            ear_score=None,
            blink_rate=payload.blink_rate,
            head_pose=None,
            recorded_at=datetime.datetime.utcnow(),
        )
        db.add(log)
        db.commit()
        return AnalyzeResponse(
            fatigue_level="low",
            confidence=0.0,
            ear_score=None,
            head_pose=None,
            message="No face detected in frame",
        )

    left_ear, right_ear, avg_ear, mar, pitch, yaw, roll = features
    head_pose_str = f"pitch:{pitch:.1f},yaw:{yaw:.1f},roll:{roll:.1f}"

    # 4. ML inference
    result = ml_service.predict(features)
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="ML model not loaded. Place model_v1.pkl in model/v1.pkl and restart."
        )

    fatigue_level = result["fatigue_level"]
    confidence    = result["confidence"]

    # 5. Write to fatigue_logs
    log = FatigueLog(
        user_id=current_user.id,
        meeting_id=payload.meeting_id,
        fatigue_level=fatigue_level,
        ear_score=round(avg_ear, 4),
        blink_rate=payload.blink_rate,
        head_pose=head_pose_str,
        recorded_at=datetime.datetime.utcnow(),
    )
    db.add(log)
    db.commit()

    # 6. Return result
    return AnalyzeResponse(
        fatigue_level=fatigue_level,
        confidence=confidence,
        ear_score=round(avg_ear, 4),
        head_pose=head_pose_str,
        message=None,
    )