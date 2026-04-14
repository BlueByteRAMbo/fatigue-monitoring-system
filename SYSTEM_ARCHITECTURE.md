# 🏗️ System Architecture & Technical Elaboration

This document provides a deep-dive into the technical implementation of the **Fatigue Monitoring System**.

---

## 1. Core Services

### A. Backend (FastAPI + SQLAlchemy)
The backend manages ML inference, presence, and persistence.
-   **Standardization**: All timestamps are standardized to **India Standard Time (IST)** through a centralized utility.
-   **Security**: JWT-based authentication with standard 24-hour expiration windows.
-   **Database**: Designed for **PostgreSQL (Neon)**. Includes SSL support and connection pooling.

### B. Chrome Extension (Manifest V3)
Acts as the edge sensor for fatigue data.
-   **Presence Signal**: Uses a persistent WebSocket heartbeat to certify that a student is actively monitoring. Disconnecting marks them as "Left".
-   **Join-Time Synchronization**: Fetches the server-side `user_joined_at` timestamp for the specific session. This ensures the extension timer accurately reflects the student's personal duration, not the meeting's age.

---

## 2. Technical Data Flows

### Attendance Loop
1.  **Join**: Student sends `/join` POST. Backend creates `MeetingParticipant`.
2.  **Telemetry**: Extension opens `/ws/student/{user_id}` and starts sending frames to `/analyze`.
3.  **Active State**: Backend calculates duration from `joined_at` up to `now` (IST) for the dashboard.
4.  **Disconnect**: Extension closes. WS `on_disconnect` handler in backend immediately sets `left_at`.

### ML Prediction Pipeline
1.  **Image Prep**: Extension downscales frames to 640px for faster Base64 transfer.
2.  **Landmarking**: MediaPipe Face Mesh extracts 468 points.
3.  **Refinement**: Pitch, Yaw, and Roll are calculated via 3D Perspective-n-Point (PnP) math.
4.  **Inference**: Features are fed to a **Random Forest** model with dynamic EAR thresholds (0.82x of personal baseline).

---

## 3. Communication Protocols

| Protocol | Use Case | Target |
| :--- | :--- | :--- |
| **HTTP (JSON)** | Auth, Join, Analyze, Exports | Any Client |
| **WebSocket (JSON)** | Live Status Updates | Teacher Dashboard |
| **WebSocket (Presence)** | Online Status Heatbeat | Student Extension |

---

## 4. Mathematical Thresholds

-   **EAR (Eye Aspect Ratio)**: Standard drowsiness detection ($< 0.22$).
-   **MAR (Mouth Aspect Ratio)**: Yawn frequency identification ($> 0.55$).
-   **Head Pose**: Nodding/Distraction threshold ($\pm 20^\circ$ Pitch).
