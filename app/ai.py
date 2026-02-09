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

def generate_quiz_from_audio(audio_file_path: str):
    """
    Generates a quiz from a local audio file using Google GenAI.
    """
    uploaded_file = None
    try:
        print(f"--> Uploading {audio_file_path} to Google...")
        uploaded_file = client.files.upload(file=audio_file_path)
        
        prompt = """
        Jesteś nauczycielem matematyki. Przesłuchałeś nagranie z lekcji (plik audio).
        Twoim zadaniem jest stworzyć quiz sprawdzający wiedzę.
        
        Zasady:
        1. Stwórz 3 pytania zamknięte (A, B, C, D).
        2. Format wyjściowy musi być CZYSTYM JSONEM.
        3. Język polski.

        Wzór JSON:
        [
          {
            "pytanie": "Ile wynosi delta dla x^2 + 2x + 1?",
            "odpowiedzi": ["0", "1", "-1", "4"],
            "poprawna": "0"
          }
        ]
        """

        print("--> Generating content...")
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[
                uploaded_file,
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return response.text

    except Exception as e:
        print(f"genai error: {e}")
        raise e
    finally:
        if uploaded_file:
            try:
                client.files.delete(name=uploaded_file.name)
            except:
                pass
