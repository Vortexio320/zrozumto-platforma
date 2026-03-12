from google import genai
from google.genai import types
import os
import json
import mimetypes
from dotenv import load_dotenv

load_dotenv()


def fix_latex_json_corruption(s: str) -> str:
    """
    Fix LaTeX mangled by JSON parsing: \\f in \\frac becomes form feed (U+000C),
    \\n in \\nabla becomes newline, etc. Restore these for proper KaTeX rendering.
    """
    if not isinstance(s, str):
        return s
    # \f -> form feed, \n -> newline, \r -> carriage return, \t -> tab
    replacements = [
        ("\x0crac", "\\frac"),   # form feed from \f in \frac
        ("\x0aabla", "\\nabla"),  # newline from \n in \nabla
        ("\x0dightarrow", "\\rightarrow"),  # \r in \rightarrow
        ("\x0dLeftarrow", "\\Leftarrow"),
        ("\x09heta", "\\theta"),  # tab from \t in \theta
    ]
    for old, new in replacements:
        s = s.replace(old, new)
    # Also fix lone form feed that might be from \frac in different context
    if "\x0c" in s:
        s = s.replace("\x0c", "\\f")
    return s


def fix_latex_in_structure(obj):
    """Recursively fix LaTeX corruption in quiz/flashcard/analysis JSON structures."""
    if isinstance(obj, str):
        return fix_latex_json_corruption(obj)
    if isinstance(obj, list):
        return [fix_latex_in_structure(x) for x in obj]
    if isinstance(obj, dict):
        return {k: fix_latex_in_structure(v) for k, v in obj.items()}
    return obj

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in .env")

client = genai.Client(api_key=api_key)
MODEL_NAME = "gemini-3.1-flash-lite-preview"

MIME_FALLBACKS = {".m4a": "audio/mp4", ".m4v": "video/mp4", ".webm": "video/webm"}

def _get_mime_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in MIME_FALLBACKS:
        return MIME_FALLBACKS[ext]
    guessed, _ = mimetypes.guess_type(path)
    return guessed or "application/octet-stream"


def _call_gemini_json(prompt: str) -> str:
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[prompt],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    return response.text


def generate_quiz_content(file_paths: list[str]):
    uploaded_files = []
    try:
        print(f"--> Uploading {len(file_paths)} files to Google...")
        for path in file_paths:
            mime_type = _get_mime_type(path)
            uf = client.files.upload(file=path, config=types.UploadFileConfig(mime_type=mime_type))
            uploaded_files.append(uf)
            print(f"    Uploaded: {path} (mime: {mime_type}) -> {uf.name}")

        prompt = """
        Jesteś nauczycielem matematyki. Przeanalizuj dostarczone materiały (nagranie z lekcji oraz zdjęcia zadań/notatek).
        Twoim zadaniem jest stworzyć quiz sprawdzający wiedzę z tej konkretnej lekcji.

        Zasady:
        1. Stwórz 10 pytań zamkniętych (A, B, C, D).
        2. Format wyjściowy musi być CZYSTYM JSONEM.
        3. Język polski – wyłącznie. Używaj TYLKO alfabetu łacińskiego (bez cyrylicy, bez innych znaków).
        4. Pytania powinny nawiązywać do treści z nagrania i zdjęć.
        5. Każde pytanie MUSI zawierać pole "wyjasnienie" z krótkim uzasadnieniem poprawnej odpowiedzi.

        WAŻNE - Formatowanie matematyczne (LaTeX) i JSON:
        - Wszystkie wyrażenia matematyczne, wzory, liczby w kontekście matematycznym, równania, ułamki, potęgi, pierwiastki itp. MUSZĄ być zapisane w notacji LaTeX.
        - Użyj $...$ dla wyrażeń w linii tekstu, np. $x^2 + 3x - 5$, $\\\\frac{1}{2}$, $\\\\sqrt{16}$, $2x + 3 = 7$.
        - W JSON backslash musisz escapować: pisz \\\\frac zamiast \\frac, \\\\sqrt zamiast \\sqrt.
        - Zwykły tekst opisowy (bez matematyki) zapisuj normalnie, BEZ znaczników LaTeX.
        - Przykłady poprawnego zapisu w JSON:
          - pytanie: "Ile wynosi $\\\\frac{3}{4} + \\\\frac{1}{2}$?"
          - odpowiedź: "A) $\\\\frac{5}{4}$"
          - wyjasnienie: "Sprowadzamy do wspólnego mianownika: $\\\\frac{3}{4} + \\\\frac{2}{4} = \\\\frac{5}{4}$"

        Wzór JSON:
        [
          {
            "pytanie": "Treść pytania z $wyrażeniem LaTeX$...",
            "odpowiedzi": ["A) $wzór$", "B) $wzór$", "C) $wzór$", "D) $wzór$"],
            "poprawna": "A) $wzór$",
            "wyjasnienie": "Poprawna odpowiedź to A, ponieważ $wzór$..."
          }
        ]
        """

        print("--> Generating content...")
        contents = []
        contents.extend(uploaded_files)
        contents.append(prompt)

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return response.text

    except Exception as e:
        print(f"genai error: {e}")
        raise e
    finally:
        print("--> Cleaning up remote files...")
        for uf in uploaded_files:
            try:
                client.files.delete(name=uf.name)
            except:
                pass


def generate_lesson_summary(file_paths: list[str]) -> dict:
    """Analyzes lesson files and returns a dict with 'title' and 'description'."""
    uploaded_files = []
    try:
        for path in file_paths:
            mime_type = _get_mime_type(path)
            uf = client.files.upload(file=path, config=types.UploadFileConfig(mime_type=mime_type))
            uploaded_files.append(uf)

        prompt = """
        Przeanalizuj dostarczone materiały z lekcji (nagranie audio i/lub zdjęcia notatek).
        Rozpoznaj temat lekcji i wygeneruj:
        1. Krótki, konkretny tytuł lekcji (np. "Logarytmy i ich właściwości", "Równania kwadratowe").
        2. Opis lekcji w 1-2 zdaniach opisujący czego dotyczy lekcja.

        Używaj wyłącznie języka polskiego i alfabetu łacińskiego (bez cyrylicy).

        Format JSON:
        {
          "title": "Konkretny tytuł lekcji...",
          "description": "Krótki opis treści lekcji..."
        }
        """

        contents = []
        contents.extend(uploaded_files)
        contents.append(prompt)

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        clean = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)

    except Exception as e:
        print(f"generate_lesson_summary error: {e}")
        return {}
    finally:
        for uf in uploaded_files:
            try:
                client.files.delete(name=uf.name)
            except:
                pass


def generate_more_questions(quiz_context: list[dict], count: int = 10, difficulty: str = "same") -> str:
    difficulty_map = {
        "easier": "łatwiejsze niż podane przykłady",
        "same": "na podobnym poziomie trudności co podane przykłady",
        "harder": "trudniejsze niż podane przykłady",
    }
    diff_text = difficulty_map.get(difficulty, difficulty_map["same"])
    existing = json.dumps(quiz_context, ensure_ascii=False)

    prompt = f"""
    Jesteś nauczycielem matematyki. Oto istniejące pytania quizowe z lekcji:

    {existing}

    Wygeneruj {count} NOWYCH pytań zamkniętych (A, B, C, D) na ten sam temat.
    Pytania powinny być {diff_text}.
    NIE powtarzaj istniejących pytań.
    Język polski – wyłącznie. Używaj TYLKO alfabetu łacińskiego (bez cyrylicy). Format: CZYSTY JSON.

    WAŻNE - Formatowanie matematyczne (LaTeX) i JSON:
    - Wszystkie wyrażenia matematyczne, wzory, liczby w kontekście matematycznym, równania, ułamki, potęgi, pierwiastki itp. MUSZĄ być zapisane w notacji LaTeX.
    - Użyj $...$ dla wyrażeń w linii tekstu. W JSON backslash escapuj: pisz \\\\frac zamiast \\frac, \\\\sqrt zamiast \\sqrt.
    - Zwykły tekst opisowy zapisuj normalnie, BEZ znaczników LaTeX.

    Wzór JSON:
    [
      {{
        "pytanie": "Treść pytania z $wyrażeniem LaTeX$...",
        "odpowiedzi": ["A) $wzór$", "B) $wzór$", "C) $wzór$", "D) $wzór$"],
        "poprawna": "A) $wzór$",
        "wyjasnienie": "Poprawna odpowiedź to A, ponieważ $wzór$..."
      }}
    ]
    """
    return _call_gemini_json(prompt)


def generate_flashcards(quiz_context: list[dict]) -> str:
    existing = json.dumps(quiz_context, ensure_ascii=False)

    prompt = f"""
    Jesteś nauczycielem matematyki. Na podstawie poniższych pytań quizowych z lekcji,
    stwórz zestaw fiszek do nauki kluczowych pojęć.

    Pytania quizowe:
    {existing}

    Zasady:
    1. Stwórz 8-12 fiszek.
    2. Każda fiszka ma "przod" (pojęcie, pytanie lub wzór) i "tyl" (wyjaśnienie, odpowiedź).
    3. Fiszki powinny pokrywać najważniejsze pojęcia z lekcji.
    4. Język polski – wyłącznie. Używaj TYLKO alfabetu łacińskiego (bez cyrylicy). Format: CZYSTY JSON.

    WAŻNE - Formatowanie matematyczne (LaTeX) i JSON:
    - Wszystkie wyrażenia matematyczne, wzory, równania itp. MUSZĄ być zapisane w notacji LaTeX.
    - Użyj $...$ dla wyrażeń w linii tekstu. W JSON backslash escapuj: pisz \\\\frac zamiast \\frac.
    - Zwykły tekst opisowy zapisuj normalnie, BEZ znaczników LaTeX.

    Wzór JSON:
    [
      {{
        "przod": "Czym jest $wyrażenie$?",
        "tyl": "To jest $wzór$..."
      }}
    ]
    """
    return _call_gemini_json(prompt)


def analyze_open_answer(question: str, image_base64: str) -> dict:
    """Analyze a student's handwritten/drawn answer using Gemini vision."""
    import base64
    image_bytes = base64.b64decode(image_base64)

    prompt = f"""Jesteś nauczycielem matematyki. Uczeń odpowiedział na pytanie otwarte, pisząc/rysując odpowiedź na tablicy.

Pytanie: {question}

Przeanalizuj obraz z odpowiedzią ucznia i oceń, czy jest poprawna.

WAŻNE:
- Dokładnie przeanalizuj to, co uczeń napisał/narysował na obrazie.
- Oceń poprawność rozwiązania krok po kroku.
- Jeśli odpowiedź jest częściowo poprawna, uznaj ją za niepoprawną, ale doceń poprawne elementy.
- Bądź konstruktywny i motywujący w uzasadnieniu.
- Jeśli odwołujesz się do wzorów lub wyrażeń matematycznych, użyj notacji LaTeX w $...$ (np. $x^2$, $\\frac{{1}}{{2}}$).
- W JSON przed poleceniami LaTeX używaj podwójnego backslasha, np. \\\\frac{{4}}{{2}} zamiast \\frac.

Format JSON:
{{
  "poprawna": true/false,
  "uzasadnienie": "Szczegółowe uzasadnienie oceny..."
}}"""

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            prompt,
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    clean = response.text.replace("```json", "").replace("```", "").strip()
    result = json.loads(clean)
    uz = result.get("uzasadnienie", "")
    uz = uz.replace("\\n", "\n")
    uz = uz.replace("\\t", "\t")
    if "\x0c" in uz:
        uz = uz.replace("\x0c", "\\f")
    result["uzasadnienie"] = uz
    return result


def generate_analysis(questions: list[dict], user_answers: list) -> str:
    data = []
    for i, q in enumerate(questions):
        ans = user_answers[i] if i < len(user_answers) else None
        correct = q.get("poprawna", "")
        data.append({
            "pytanie": q.get("pytanie", ""),
            "poprawna": correct,
            "odpowiedz_ucznia": ans,
            "czy_poprawna": ans == correct if ans else False,
            "pominiete": ans is None,
        })

    context = json.dumps(data, ensure_ascii=False)

    prompt = f"""
    Jesteś nauczycielem matematyki. Przeanalizuj wyniki quizu ucznia:

    {context}

    Na podstawie wyników napisz krótką analizę (po polsku) w formacie JSON:
    {{
      "mocne_strony": "Opis mocnych stron ucznia (co dobrze opanował)...",
      "obszary_do_poprawy": "Opis obszarów wymagających poprawy...",
      "wskazowki": "Konkretne wskazówki do dalszej nauki..."
    }}

    Bądź konstruktywny i motywujący. Format: CZYSTY JSON.
    Jeśli odwołujesz się do wzorów lub wyrażeń matematycznych, użyj notacji LaTeX w $...$ (w JSON escapuj backslash: \\\\frac).
    """
    return _call_gemini_json(prompt)
