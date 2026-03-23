from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .routers import lessons, quizzes, auth, webhooks, admin, tasks
from .neo4j import init_neo4j, close_neo4j, get_neo4j
import os
from dotenv import load_dotenv

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_neo4j()
    yield
    close_neo4j()


app = FastAPI(title="ZrozumTo Platforma", version="0.1.0", lifespan=lifespan)

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
app.include_router(admin.router)
app.include_router(tasks.router)



from pathlib import Path
import base64
import logging
import re
import subprocess
import tempfile
import uuid
from fastapi import Body
from fastapi.responses import FileResponse, HTMLResponse, Response

logger = logging.getLogger(__name__)

# ... (Previous code)

# Define Base Dir
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

# Health: Neo4j status (no auth)
@app.get("/api/neo4j/status")
async def neo4j_status():
    driver = get_neo4j()
    if not driver:
        return {"connected": False, "message": "Neo4j not configured"}
    try:
        driver.verify_connectivity()
        return {"connected": True}
    except Exception as e:
        return {"connected": False, "message": str(e)}

import re

def _prepare_tikz(raw: str) -> str:
    """Sanitize TikZ code for web-based compilation."""
    raw = re.sub(r'\\n(?![a-zA-Z])', '\n', raw)
    raw = re.sub(r'\\t(?![a-zA-Z])', '\t', raw)
    raw = raw.replace('\u00A0', ' ')

    
    _PL_MAP = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")
    raw = raw.translate(_PL_MAP)
    
    #raw = raw.replace("font=\\sffamily", "").replace("font=\\sansmath", "")
    #raw = re.sub(r",\s*font=[^,\]]+", "", raw)
    #raw = re.sub(r"font=[^,\]]+,\s*", "", raw)
    #raw = re.sub(r"font=[^,\]\}]+", "", raw)
    
    if "\\begin{center}" in raw:
        raw = raw.replace("\\begin{center}", "").replace("\\end{center}", "").strip()
    
    
    return raw


# TikZ to SVG (server-side pdflatex + pdf2svg) - reliable, no nullfont
@app.post("/api/tikz-svg")
async def tikz_to_svg(t: str = Body(..., embed=True)):
    try:
        raw = base64.b64decode(t, validate=True).decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64")
    
    tikz = _prepare_tikz(raw)
    if not tikz.strip():
        raise HTTPException(status_code=400, detail="Empty TikZ")

    name = f"tikz_{uuid.uuid4().hex[:12]}"
    with tempfile.TemporaryDirectory() as tmp:
        tex_path = Path(tmp) / f"{name}.tex"
        
        # CZYSTY pdflatex. Żadnego wpisu 'dvisvgm' w nawiasach kwadratowych.
        tex_path.write_text(
            r"""\documentclass[tikz,border=20pt]{standalone}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{amsmath}
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}
\usetikzlibrary{angles,quotes,calc,matrix,arrows.meta,positioning}
\begin{document}
"""
            + tikz
            + r"""
\end{document}
""",
            encoding="utf-8",
        )
        
        # 1. Kompilacja do twardego PDF. On nigdy nie gubi współrzędnych.
        pdflatex = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", str(tex_path)],
            cwd=tmp, capture_output=True, text=True, timeout=30
        )
        pdf_path = Path(tmp) / f"{name}.pdf"
        if not pdf_path.exists():
            log_preview = (pdflatex.stdout or "") + (pdflatex.stderr or "")
            raise HTTPException(status_code=422, detail=f"pdflatex failed: {log_preview[-500:]}")

        # 2. Konwersja na SVG za pomocą pdf2svg (które działa, bo masz już poppler-data w systemie)
        svg_path = Path(tmp) / f"{name}.svg"
        pdf2svg = subprocess.run(
            ["pdf2svg", str(pdf_path), str(svg_path)],
            cwd=tmp, capture_output=True, text=True, timeout=10
        )
        
        if not svg_path.exists() or pdf2svg.returncode != 0:
            err = (pdf2svg.stdout or "") + (pdf2svg.stderr or "")
            raise HTTPException(status_code=500, detail=f"pdf2svg error: {err}")

        svg_content = svg_path.read_text(encoding="utf-8")
        
    return Response(content=svg_content, media_type="image/svg+xml")

# Config endpoint for frontend (Supabase anon key - no auth required)
@app.get("/api/config")
async def get_config():
    url = os.environ.get("SUPABASE_URL")
    anon_key = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not anon_key:
        raise HTTPException(status_code=500, detail="Supabase config not configured")
    return {"supabaseUrl": url, "supabaseAnonKey": anon_key}

# Mount static assets (Vite outputs JS/CSS to static/assets/)
app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

# Serve index.html for the root and any non-API paths (SPA fallback)
@app.get("/")
async def read_root():
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.get("/{path:path}")
async def spa_fallback(path: str):
    file_path = STATIC_DIR / path
    if file_path.is_file():
        return FileResponse(str(file_path))
    return FileResponse(str(STATIC_DIR / "index.html"))
