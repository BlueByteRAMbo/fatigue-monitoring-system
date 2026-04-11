from fastapi import FastAPI
from app.database.database import engine
from app.database.models import Base
from app.auth.routes import router as auth_router
from app.meetings.routes import router as meetings_router

app = FastAPI()

app.include_router(auth_router)
app.include_router(meetings_router)

Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"message": "Fatigue Monitoring API Running"}