from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.database import engine
from app.database.models import Base
from app.auth.routes import router as auth_router
from app.meetings.routes import router as meetings_router
from app.analysis.routes import router as analysis_router
from app.services import ml as ml_service

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    ml_service.load_model()

app.include_router(auth_router)
app.include_router(meetings_router)
app.include_router(analysis_router)

Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"message": "Fatigue Monitoring API Running"}