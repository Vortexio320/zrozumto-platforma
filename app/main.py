from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .routers import lessons, quizzes, auth, webhooks
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ZrozumTo Platforma", version="0.1.0")

# CORS (Allow frontend to communicate)
_cors_origins = os.environ.get(
    "CORS_ORIGINS",
    "https://platforma.zrozum-to.pl,http://localhost:8000,http://127.0.0.1:8000"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
app.include_router(auth.router)
app.include_router(lessons.router)
app.include_router(quizzes.router)
app.include_router(webhooks.router)



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
