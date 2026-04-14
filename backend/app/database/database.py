from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:                                       
    raise RuntimeError("DATABASE_URL is not set in .env")

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
elif "neon.tech" in DATABASE_URL or "sslmode=require" in DATABASE_URL:
    # Neon and most cloud providers require SSL
    engine = create_engine(
        DATABASE_URL,
        connect_args={"sslmode": "require"},
        pool_pre_ping=True
    )
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# ADDED: moved here so any route file can import it without circular imports
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()