from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Use local sqlite as a fallback so the server doesn't crash if the env var is missing
    print("WARNING: DATABASE_URL not found. Falling back to local SQLite.")
    DATABASE_URL = "sqlite:///./fatigue.db"

# SQLAlchemy fix for Heroku/Neon: replace postgres:// with postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    # Neon and most cloud providers require SSL
    connect_args = {}
    if "neon.tech" in DATABASE_URL or "sslmode=require" in DATABASE_URL:
        connect_args = {"sslmode": "require"}
        
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# ADDED: moved here so any route file can import it without circular imports
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()