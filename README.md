# 🛡️ Fatigue Monitoring System

An AI-powered real-time fatigue detection and monitoring system designed for virtual classrooms and remote work. The system uses computer vision and machine learning (MediaPipe + Random Forest) to analyze student engagement and fatigue levels.

![Fatigue Detection Overview](https://img.shields.io/badge/Status-Production--Ready-brightgreen)
![IST Synchronized](https://img.shields.io/badge/Timezone-IST%20(UTC%2B5:30)-blue)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)
![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB)

## 🚀 Overview

The **Fatigue Monitoring System** provides teachers with real-time insights into student well-being. By analyzing Eye Aspect Ratio (EAR), blink rates, and head pose, the system identifies drowsiness and sends proactive alerts to prevent burnout.

## ✨ Key Features (New!)

-   **🌍 IST Standardization**: The entire system (DB, Logs, UI) is now perfectly synchronized with **India Standard Time (IST)**. No more UTC offsets!
-   **⏱️ Student-Specific Timer**: The extension timer now starts at exactly `00:00:00` from the moment a student joins a meeting, providing an accurate measure of personal session duration.
-   **📡 Automated Presence**: Attendance is tracked via WebSockets. If a student closes their browser or loses connection, they are automatically marked as "Left" in the database.
-   **🛡️ Multi-Session Tracking**: Supports students joining and leaving multiple times within the same meeting, with total time cumulatively calculated.

## 🛠️ Project Structure

```text
├── backend/            # FastAPI API & ML Logic (Python)
├── dashboard/          # React + Vite Portals (Teacher & Student)
├── extension/          # Chrome Extension (Manifest V3)
├── model/              # Pre-trained ML models (Scikit-learn)
├── SYSTEM_ARCHITECTURE.md # Deep technical breakdown
└── TEST_CHECKLIST.md      # Final verification guide
```

## 🔧 Setup Guide

### 1. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Copy .env.example to .env and configure
uvicorn app.main:app --reload
```

### 2. Dashboard
```bash
cd dashboard
npm install
npm run dev
```

### 3. Chrome Extension
1. Go to `chrome://extensions/`.
2. Enable **Developer Mode**.
3. **Load unpacked** from the `extension/` folder.

## 📊 Deployment
The system is ready for **Neon DB** (PostgreSQL). Simply update your `DATABASE_URL` in the `.env` file. SSL support and connection pooling are already pre-configured in the SQLAlchemy engine.

## 🔒 License
MIT License.