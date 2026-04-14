from pydantic import BaseModel
from typing import Optional, List
import datetime


class MeetingCreate(BaseModel):
    title: str


class ParticipantResponse(BaseModel):
    user_id: int
    joined_at: datetime.datetime

    class Config:
        from_attributes = True


class MeetingResponse(BaseModel):
    id: int
    title: str
    host_id: int
    join_code: str
    started_at: datetime.datetime
    ended_at: Optional[datetime.datetime]
    user_joined_at: Optional[datetime.datetime] = None
    participants: List[ParticipantResponse] = []

    class Config:
        from_attributes = True


class FatigueLogCreate(BaseModel):
    meeting_id: int
    fatigue_level: str          # "low", "medium", "high"
    ear_score: Optional[float] = None
    blink_rate: Optional[float] = None
    head_pose: Optional[str]   = None


class FatigueLogResponse(BaseModel):
    id: int
    user_id: int
    meeting_id: int
    fatigue_level: str
    ear_score: Optional[float]
    blink_rate: Optional[float]
    head_pose: Optional[str]
    recorded_at: datetime.datetime

    class Config:
        from_attributes = True


class SessionInfo(BaseModel):
    joined_at: datetime.datetime
    left_at: Optional[datetime.datetime]


class AttendanceResponse(BaseModel):
    user_id: int
    name: str
    email: str
    sessions: List[SessionInfo]
    total_minutes: int
    first_seen: datetime.datetime