from google import genai
from google.genai import types
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in .env")

client = genai.Client(api_key=api_key)
MODEL_NAME = "gemini-2.0-flash"

def generate_quiz_content(file_paths: list[str]):
    """
    Generates a quiz from a list of local files (audio, images) using Google GenAI.
    """
    uploaded_files = []
    try:
        print(f"--> Uploading {len(file_paths)} files to Google...")
        for path in file_paths:
            uf = client.files.upload(file=path)
            uploaded_files.append(uf)
            print(f"    Uploaded: {path} -> {uf.name}")
        
        prompt = """
        Jesteś nauczycielem matematyki. Przeanalizuj dostarczone materiały (nagranie z lekcji oraz zdjęcia zadań/notatek).
        Twoim zadaniem jest stworzyć quiz sprawdzający wiedzę z tej konkretnej lekcji.
        
        Zasady:
        1. Stwórz 3 pytania zamknięte (A, B, C, D).
        2. Format wyjściowy musi być CZYSTYM JSONEM.
        3. Język polski.
        4. Pytania powinny nawiązywać do treści z nagrania i zdjęć.

        Wzór JSON:
        [
          {
            "pytanie": "Treść pytania...",
            "odpowiedzi": ["A", "B", "C", "D"],
            "poprawna": "A"
          }
        ]
        """

        print("--> Generating content...")
        # Prepare contents array with all files + prompt
        contents = []
        contents.extend(uploaded_files)
        contents.append(prompt)

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return response.text

    except Exception as e:
        print(f"genai error: {e}")
        raise e
    finally:
        # Cleanup remote files
        print("--> Cleaning up remote files...")
        for uf in uploaded_files:
            try:
                client.files.delete(name=uf.name)
            except:
                pass
