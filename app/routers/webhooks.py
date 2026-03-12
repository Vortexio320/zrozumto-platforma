from fastapi import APIRouter, Header, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Depends
from typing import List, Optional
import os
import shutil
import uuid
import zipfile
from datetime import datetime
from ..services import get_admin_supabase
from ..worker import process_ingested_content

MAX_ZIP_FILES = 20
SKIP_PREFIXES = ("__MACOSX", ".")

router = APIRouter(
    prefix="/webhooks",
    tags=["webhooks"]
)

# Dependency to check Secret
async def verify_secret(x_webhook_secret: str = Header(...)):
    expected_secret = os.getenv("WEBHOOK_SECRET")
    if not expected_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured on server")
    if x_webhook_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")
    return x_webhook_secret

@router.post("/ingest")
async def ingest_lesson(
    background_tasks: BackgroundTasks,
    student_username: str = Form(...),
    title: Optional[str] = Form(None),
    lesson_date: Optional[str] = Form(None),
    files: List[UploadFile] = File(None),
    secret: str = Depends(verify_secret),
):
    print(f"WEBHOOK: Received {len(files) if files else 0} files")
    print(f"WEBHOOK: Received ingestion request for: {student_username}, topic: {title}")
    supabase = get_admin_supabase()

    user_id = None
    try:
        profile = supabase.table("profiles").select("id").eq("username", student_username).single().execute()
        user_id = profile.data["id"]
    except Exception as e:
        print(f"WEBHOOK ERROR: User lookup failed: {e}")

    if not user_id:
        print(f"WEBHOOK WARNING: Student '{student_username}' not found.")
        raise HTTPException(status_code=404, detail=f"Student '{student_username}' not found")

    temp_dir = "temp_ingest"
    os.makedirs(temp_dir, exist_ok=True)
    raw_paths = []
    if files:
        for i, file in enumerate(files):
            ext = os.path.splitext(file.filename or "")[1].lower()
            if not ext and file.content_type:
                ct = file.content_type.lower()
                if "zip" in ct:
                    ext = ".zip"
                elif "/" in ct:
                    ext = "." + ct.split("/")[-1].replace("x-", "")
            ext = ext or ".bin"
            safe_name = f"{datetime.now().timestamp()}_{i}_{uuid.uuid4().hex[:8]}{ext}"
            file_path = os.path.join(temp_dir, safe_name)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            raw_paths.append(file_path)
            print(f"WEBHOOK: Saved file {i}: {file.filename} (content_type={file.content_type}) → {file_path}")

    temp_paths = []
    for path in raw_paths:
        if zipfile.is_zipfile(path):
            extract_dir = path + "_extracted"
            os.makedirs(extract_dir, exist_ok=True)
            try:
                with zipfile.ZipFile(path, 'r') as zf:
                    if len(zf.namelist()) > MAX_ZIP_FILES:
                        raise HTTPException(status_code=400, detail=f"Zip contains too many files (max {MAX_ZIP_FILES})")
                    zf.extractall(extract_dir)
            finally:
                os.remove(path)

            idx = 0
            for root, _, filenames in os.walk(extract_dir):
                for fname in sorted(filenames):
                    full = os.path.join(root, fname)
                    if any(part.startswith(p) for p in SKIP_PREFIXES for part in full.split(os.sep)):
                        continue
                    ext = os.path.splitext(fname)[1].lower() or ".bin"
                    safe = os.path.join(extract_dir, f"part_{idx}{ext}")
                    os.rename(full, safe)
                    temp_paths.append(safe)
                    idx += 1
            print(f"WEBHOOK: Extracted zip -> {len(temp_paths)} files: {[os.path.basename(p) for p in temp_paths]}")
        else:
            temp_paths.append(path)

    try:
        # 3. Create Lesson
        lesson_data = {
            "title": title or "Przetwarzanie...",
            "description": "Przetwarzanie materiałów...",
        }
        if lesson_date:
            lesson_data["lesson_date"] = lesson_date
        res_lesson = supabase.table("lessons").insert(lesson_data).execute()
        new_lesson = res_lesson.data[0]
        lesson_id = new_lesson['id']
        
        # 4. Assign to Student
        assignment_data = {
            "lesson_id": lesson_id,
            "student_id": user_id
        }
        supabase.table("lesson_assignments").insert(assignment_data).execute()
        
        # 5. Background Processing (Quiz)
        if temp_paths:
            background_tasks.add_task(process_ingested_content, lesson_id, temp_paths)
            
        return {"status": "success", "lesson_id": lesson_id, "message": "Lesson created, processing started"}

    except Exception as e:
        print(f"WEBHOOK ERROR: {e}")
        for p in temp_paths:
            if os.path.exists(p):
                os.remove(p)
        for p in raw_paths:
            d = p + "_extracted"
            if os.path.isdir(d):
                shutil.rmtree(d, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))
