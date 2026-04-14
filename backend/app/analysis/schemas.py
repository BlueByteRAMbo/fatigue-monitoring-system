from pydantic import BaseModel
from typing import Optional, List


class AnalyzeRequest(BaseModel):
    image_b64:  str            # base64 encoded JPEG from Chrome extension
    meeting_id: int            # which meeting this frame belongs to
    blink_rate: Optional[float] = None  # computed by extension, passed through
    baseline_ear: Optional[float] = None # personalized baseline from calibration


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
    images: List[str]          # buffer of base64 images


class CalibrateResponse(BaseModel):
    baseline_ear: float
    status: str                # "success" or error message