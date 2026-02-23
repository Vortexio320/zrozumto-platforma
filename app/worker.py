from .ai import generate_quiz_content, generate_lesson_summary
from .services import get_admin_supabase
import json
import os

def process_ingested_content(lesson_id: str, file_paths: list[str]):
    """
    Background task to process audio/images, generate quiz, and save to DB.
    """
    supabase = get_admin_supabase()
    print(f"WORKER: Starting processing for lesson {lesson_id} with {len(file_paths)} files.")

    try:
        summary = generate_lesson_summary(file_paths)
        if summary.get("title"):
            update_data = {"title": summary["title"]}
            if summary.get("description"):
                update_data["description"] = summary["description"]
            supabase.table("lessons").update(update_data).eq("id", lesson_id).execute()
            print(f"WORKER: Lesson title updated to '{summary['title']}'")

        quiz_text = generate_quiz_content(file_paths)

        clean_json = quiz_text.replace("```json", "").replace("```", "").strip()
        quiz_data = json.loads(clean_json)

        new_quiz = {
            "lesson_id": lesson_id,
            "questions_json": quiz_data
        }
        supabase.table("quizzes").insert(new_quiz).execute()
        print(f"WORKER: Quiz saved for lesson {lesson_id}")

    except Exception as e:
        print(f"WORKER ERROR: {e}")
    finally:
        print("WORKER: Cleaning up temp files...")
        for path in file_paths:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as cleanup_err:
                    print(f"WORKER: Error deleting {path}: {cleanup_err}")
