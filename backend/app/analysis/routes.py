from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.database.models import FatigueLog, Meeting
from app.auth.security import get_current_user
from app.database.models import User
from app.services import vision, ml
from app.analysis.schemas import AnalyzeRequest, AnalyzeResponse, CalibrateRequest, CalibrateResponse
from app.websockets.manager import manager
from app.core.utils import get_ist_time
import datetime

router = APIRouter(prefix="/analyze", tags=["Analysis"])


@router.post("/", response_model=AnalyzeResponse)
async def analyze_frame(
    payload: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # verify meeting exists and is active
    meeting = db.query(Meeting).filter(Meeting.id == payload.meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.ended_at:
        raise HTTPException(status_code=400, detail="Meeting has ended")

    # Use Edge Landmarks if provided, otherwise fallback to deprecated image analysis
    if payload.landmarks:
        features = vision.extract_features_from_landmarks(payload.landmarks)
    else:
        features = await run_in_threadpool(vision.extract_features, payload.image_b64)

    if features is None:
        ws_no_face_payload = {
            "user_id": current_user.id,
            "user_name": current_user.name,
            "fatigue_level": "unknown",
            "ear_score": None,
            "blink_rate": payload.blink_rate,
            "face_detected": False,
            "timestamp": get_ist_time().isoformat()
        }
        await manager.broadcast_to_meeting(payload.meeting_id, ws_no_face_payload)
        await manager.send_to_student(current_user.id, ws_no_face_payload)

        return AnalyzeResponse(
            fatigue_level="low",
            confidence=0.0,
            triggers=[],
            ear_score=None,
            mar_score=None,
            head_pose=None,
            blink_rate=payload.blink_rate,
            face_detected=False,
            brightness=None,
            position=None
        )

    # run model prediction with optional baseline_ear
    result = ml.predict(
        left_ear  = features["left_EAR"],
        right_ear = features["right_EAR"],
        avg_ear   = features["avg_EAR"],
        mar       = features["MAR"],
        pitch     = features["pitch"],
        yaw       = features["yaw"],
        roll      = features["roll"],
        baseline_ear = payload.baseline_ear
    )

    head_pose_str = f"{features['pitch']},{features['yaw']},{features['roll']}"

    # auto-write to fatigue_logs
    log = FatigueLog(
        user_id       = current_user.id,
        meeting_id    = payload.meeting_id,
        fatigue_level = result["fatigue_level"],
        ear_score     = features["avg_EAR"],
        blink_rate    = payload.blink_rate,
        head_pose     = head_pose_str,
    )
    db.add(log)
    db.commit()

    # Broadcast real-time update to any listening Teacher Dashboards
    ws_payload = {
        "user_id": current_user.id,
        "user_name": current_user.name,
        "fatigue_level": result["fatigue_level"],
        "confidence": result["confidence"],
        "ear_score": features["avg_EAR"],
        "blink_rate": payload.blink_rate,
        "head_pose": head_pose_str,
        "face_detected": True,
        "brightness": features["brightness"],
        "position": features["position"],
        "timestamp": get_ist_time().isoformat()
    }
    await manager.broadcast_to_meeting(payload.meeting_id, ws_payload)
    await manager.send_to_student(current_user.id, ws_payload)

    return AnalyzeResponse(
        fatigue_level = result["fatigue_level"],
        confidence    = result["confidence"],
        triggers      = result["triggers"],
        ear_score     = features["avg_EAR"],
        mar_score     = features["MAR"],
        head_pose     = head_pose_str,
        blink_rate    = payload.blink_rate,
        face_detected = True,
        brightness    = features["brightness"],
        position      = features["position"]
    )


@router.post("/calibrate", response_model=CalibrateResponse)
async def calibrate_user(payload: CalibrateRequest):
    ear_scores = []
    
    if payload.landmarks_list:
        for lm in payload.landmarks_list:
            features = vision.extract_features_from_landmarks(lm)
            if features and features["avg_EAR"]:
                ear_scores.append(features["avg_EAR"])
    elif payload.images:
        for img_b64 in payload.images:
            features = await run_in_threadpool(vision.extract_features, img_b64)
            if features and features["avg_EAR"]:
                ear_scores.append(features["avg_EAR"])
    else:
        raise HTTPException(status_code=400, detail="No calibration data provided")
    
    if len(ear_scores) < 3:
        return CalibrateResponse(baseline_ear=0.0, status="failed: could not detect face clearly in enough frames")
    
    avg_ear = sum(ear_scores) / len(ear_scores)
    
    # Safety Check: Reject if user is clearly already tired
    if avg_ear < 0.23:
        return CalibrateResponse(baseline_ear=0.0, status="failed: detected EAR is too low. calibration rejected for safety.")
    
    return CalibrateResponse(baseline_ear=round(avg_ear, 4), status="success")