from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from .manager import manager
from app.database.database import SessionLocal
from app.database.models import MeetingParticipant
from app.core.utils import get_ist_time
import datetime

router = APIRouter()

@router.websocket("/ws/meeting/{meeting_id}")
async def websocket_endpoint(websocket: WebSocket, meeting_id: int):
    await manager.connect(websocket, meeting_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, meeting_id)


@router.websocket("/ws/student/{user_id}")
async def student_websocket_endpoint(
    websocket: WebSocket, 
    user_id: int,
    meeting_id: int = Query(None)
):
    await manager.connect_student(websocket, user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_student(websocket, user_id)
        
        # If they were in a meeting, mark their session as ended
        if meeting_id:
            db = SessionLocal()
            try:
                # Find the most recent open session for this user in this meeting
                participant = db.query(MeetingParticipant).filter(
                    MeetingParticipant.meeting_id == meeting_id,
                    MeetingParticipant.user_id == user_id,
                    MeetingParticipant.left_at == None
                ).order_by(MeetingParticipant.joined_at.desc()).first()

                if participant:
                    participant.left_at = get_ist_time()
                    db.commit()
                    print(f"[WebSocket] Student {user_id} left meeting {meeting_id} (disconnected)")
            except Exception as e:
                print(f"[WebSocket] Error updating attendance on disconnect: {e}")
            finally:
                db.close()
