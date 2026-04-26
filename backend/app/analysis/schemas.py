from pydantic import BaseModel
from typing import Optional, List


class AnalyzeRequest(BaseModel):
    meeting_id: int            # which meeting this frame belongs to
    landmarks: Optional[List[dict]] = None # 468 landmarks from MediaPipe
    is_multi_face: Optional[bool] = False  # detected multiple people
    blink_rate: Optional[float] = None  # computed by extension, passed through
    baseline_ear: Optional[float] = None # personalized baseline from calibration
    image_b64:  Optional[str] = None    # DEPRECATED


class AnalyzeResponse(BaseModel):
    fatigue_level: str         # "low", "medium", "high"
    confidence:    float
    triggers:      List[str]   # which layers fired: ["MODEL", "EAR", "NOD"]
    ear_score:     Optional[float]
    mar_score:     Optional[float]
    head_pose:     Optional[str]  # "pitch,yaw,roll" as string
    blink_rate:    Optional[float]
    face_detected: bool
    brightness:    Optional[float] = None
    position:      Optional[str] = None


class CalibrateRequest(BaseModel):
    landmarks_list: Optional[List[List[dict]]] = None # List of 5 landmark sets
    images: Optional[List[str]] = None # DEPRECATED


class CalibrateResponse(BaseModel):
    baseline_ear: float
    status: str                # "success" or error message