from fastapi import FastAPI, UploadFile, File
from google import genai
from google.genai import types
import os
from dotenv import load_dotenv
import shutil

# 1. Konfiguracja
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    raise ValueError("Nie znaleziono klucza API! Sprawdź plik .env")

client = genai.Client(api_key=api_key)

app = FastAPI()

MODEL_NAME = "gemini-2.0-flash" 

@app.get("/")
def home():
    return {"message": f"Serwer Math-AI działa na modelu: {MODEL_NAME}"}

@app.post("/upload")
async def upload_lesson(file: UploadFile = File(...)):
    # A. Zapisz plik audio z przeglądarki na dysk serwera
    temp_filename = f"temp_{file.filename}"
    with open(temp_filename, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    uploaded_file = None
    try:
        print(f"--> Otrzymano plik: {file.filename}, wysyłam do Google...")
        
        # B. Wyślij plik do Google (File API)
        uploaded_file = client.files.upload(file=temp_filename)
        
        print("--> Plik w chmurze Google. Generuję quiz...")

        # C. Instrukcja dla AI
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

        # D. Generowanie (Multimodalne: Tekst + Audio)
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
        
        print("--> Quiz gotowy!")
        return {"status": "success", "quiz": response.text}

    except Exception as e:
        print(f"BŁĄD: {str(e)}")
        return {"status": "error", "message": str(e)}
    
    finally:
        # E. Sprzątanie
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        if uploaded_file:
            try:
                client.files.delete(name=uploaded_file.name)
            except:
                pass