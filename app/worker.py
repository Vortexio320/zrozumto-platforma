from .ai import generate_quiz_content
from .services import get_supabase
import json
import os

def process_ingested_content(lesson_id: str, file_paths: list[str]):
    """
    Background task to process audio/images, generate quiz, and save to DB.
    """
    supabase = get_supabase()
    print(f"WORKER: Starting processing for lesson {lesson_id} with {len(file_paths)} files.")

    try:
        # 1. Generate Quiz Content via Gemini
        quiz_text = generate_quiz_content(file_paths)
        
        # 2. Parse JSON
        # Clean potential markdown code blocks
        clean_json = quiz_text.replace("```json", "").replace("```", "").strip()
        quiz_data = json.loads(clean_json)
        
        # 3. Save to Supabase
        new_quiz = {
            "lesson_id": lesson_id,
            "questions_json": quiz_data
        }
        res = supabase.table("quizzes").insert(new_quiz).execute()
        print(f"WORKER: Quiz saved for lesson {lesson_id}")

    except Exception as e:
        print(f"WORKER ERROR: {e}")
        # Optionally update lesson description with error?
    finally:
        # 4. Cleanup local temp files
        print("WORKER: Cleaning up temp files...")
        for path in file_paths:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as cleanup_err:
                    print(f"WORKER: Error deleting {path}: {cleanup_err}")
