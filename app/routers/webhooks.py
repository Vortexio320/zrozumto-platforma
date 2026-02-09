from fastapi import APIRouter, Header, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Depends
from typing import List, Optional
import os
import shutil
from datetime import datetime
from ..services import get_supabase
from ..worker import process_ingested_content

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
    student_email: str = Form(...),
    title: str = Form(...),
    files: List[UploadFile] = File(None),
    secret: str = Depends(verify_secret),
):
    print(f"WEBHOOK: Received ingestion request for: {student_email}, topic: {title}")
    supabase = get_supabase() # Service Role Client

    # 1. Find User by Email
    # In Supabase, usually profiles table mirrors auth.users, but for email we must check auth.users via Admin API
    # because profiles table might not have email or RLS blocks it.
    # Service Role allows bypassing RLS, but email is in auth schema.
    
    user_id = None
    try:
        # Fetch users (default limit is 50, usually enough for now)
        # Note: supabase-py admin client usage might vary by version.
        # We try to use the auth.admin interface.
        users_response = supabase.auth.admin.list_users()
        for user in users_response:
             if user.email == student_email:
                 user_id = user.id
                 break
    except Exception as e:
        print(f"WEBHOOK ERROR: User lookup failed: {e}")
        # Fallback: Try to find in profiles if email column existed (it doesn't).
        pass

    if not user_id:
        print(f"WEBHOOK WARNING: Student with email {student_email} not found.")
        raise HTTPException(status_code=404, detail=f"Student with email {student_email} not found")

    # 2. Save uploaded files to temp
    temp_paths = []
    if files:
        temp_dir = "temp_ingest"
        os.makedirs(temp_dir, exist_ok=True)
        for file in files:
            file_path = os.path.join(temp_dir, f"{datetime.now().timestamp()}_{file.filename}")
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            temp_paths.append(file_path)

    try:
        # 3. Create Lesson
        lesson_data = {
            "title": title,
            "description": "Lekcja z automatyzacji (webhook)",
            # "date": ... we could add date column later
        }
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
        # Cleanup if failed immediately
        for p in temp_paths:
            if os.path.exists(p):
                os.remove(p)
        raise HTTPException(status_code=500, detail=str(e))
