from pydantic import BaseModel
from typing import Optional


class AnalyzeRequest(BaseModel):
    meeting_id: int
    frame: str           # base64-encoded image (JPEG or PNG)
    blink_rate: Optional[float] = None   # computed by extension, stored for analytics


class AnalyzeResponse(BaseModel):
    fatigue_level: str                   # "low" | "medium" | "high"
    confidence:    float
    ear_score:     Optional[float]       # avg EAR from this frame
    head_pose:     Optional[str]         # e.g. "pitch:-24.1,yaw:7.8,roll:2.2"
    message:       Optional[str]         # human-readable note if face not detected