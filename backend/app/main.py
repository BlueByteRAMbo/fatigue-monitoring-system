# ✅ FIXED: backend/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.database import engine
from app.database.models import Base
from app.auth.routes import router as auth_router
from app.meetings.routes import router as meetings_router
from app.analysis.routes import router as analysis_router
from app.websockets.routes import router as ws_router
from app.services import ml

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://fatigue-monitoring-system-api.onrender.com",
    ],
    # This Regex is the most reliable way to allow ALL Render subdomains and the Extension
    allow_origin_regex=r"https://.*\.render\.com|chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)    
    ml.load_model()

app.include_router(auth_router)
app.include_router(meetings_router)
app.include_router(analysis_router)
app.include_router(ws_router)

@app.get("/")
def root():
    return {"message": "Fatigue Monitoring API Running"}