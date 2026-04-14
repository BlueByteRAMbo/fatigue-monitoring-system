from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from .database import Base
from app.core.utils import get_ist_time
import datetime
import enum


class User(Base):
    __tablename__ = "users"

    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String, nullable=False)
    email    = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role     = Column(String, nullable=False)

    hosted_meetings      = relationship("Meeting", back_populates="host")
    meeting_participants = relationship("MeetingParticipant", back_populates="user")
    fatigue_logs         = relationship("FatigueLog", back_populates="user")


class Meeting(Base):
    __tablename__ = "meetings"

    id         = Column(Integer, primary_key=True, index=True)
    title      = Column(String, nullable=False)
    host_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    join_code  = Column(String, unique=True, nullable=False)
    started_at = Column(DateTime, default=get_ist_time)
    ended_at   = Column(DateTime, nullable=True)

    host         = relationship("User", back_populates="hosted_meetings")
    participants = relationship("MeetingParticipant", back_populates="meeting")
    fatigue_logs = relationship("FatigueLog", back_populates="meeting")


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    id         = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    joined_at  = Column(DateTime, default=get_ist_time)
    left_at    = Column(DateTime, nullable=True)

    meeting = relationship("Meeting", back_populates="participants")
    user    = relationship("User", back_populates="meeting_participants")


class FatigueLog(Base):
    __tablename__ = "fatigue_logs"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    meeting_id    = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    fatigue_level = Column(String, nullable=False)  # "low", "medium", "high"
    ear_score     = Column(Float, nullable=True)
    blink_rate    = Column(Float, nullable=True)
    head_pose     = Column(String, nullable=True)   # stored as "pitch,yaw,roll"
    recorded_at   = Column(DateTime, default=get_ist_time)

    user    = relationship("User", back_populates="fatigue_logs")
    meeting = relationship("Meeting", back_populates="fatigue_logs")