from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        # Maps meeting_id -> list of active websockets (teachers)
        self.active_connections: Dict[int, List[WebSocket]] = {}
        # Maps user_id -> list of active websockets (students personal channel)
        self.student_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: int):
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
        self.active_connections[meeting_id].append(websocket)

    def disconnect(self, websocket: WebSocket, meeting_id: int):
        if meeting_id in self.active_connections:
            if websocket in self.active_connections[meeting_id]:
                self.active_connections[meeting_id].remove(websocket)
            if not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]

    async def connect_student(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.student_connections:
            self.student_connections[user_id] = []
        self.student_connections[user_id].append(websocket)

    def disconnect_student(self, websocket: WebSocket, user_id: int):
        if user_id in self.student_connections:
            if websocket in self.student_connections[user_id]:
                self.student_connections[user_id].remove(websocket)
            if not self.student_connections[user_id]:
                del self.student_connections[user_id]

    async def broadcast_to_meeting(self, meeting_id: int, message: dict):
        if meeting_id in self.active_connections:
            for connection in self.active_connections[meeting_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    # Connection might have died unexpectedly
                    print(f"[WebSocket] Error broadcasting to connection: {e}")

    async def send_to_student(self, user_id: int, message: dict):
        if user_id in self.student_connections:
            for connection in self.student_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    print(f"[WebSocket] Error sending to student {user_id}: {e}")

manager = ConnectionManager()
