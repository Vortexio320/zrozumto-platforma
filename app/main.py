from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .routers import lessons, quizzes, auth
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ZrozumTo Platforma", version="0.1.0")

# CORS (Allow frontend to communicate)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
app.include_router(auth.router)
app.include_router(lessons.router)
app.include_router(quizzes.router)



from pathlib import Path
from fastapi.responses import FileResponse

# ... (Previous code)

# Define Base Dir
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

# Mount static files at /static
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
async def read_root():
    return FileResponse(str(STATIC_DIR / "index.html"))
