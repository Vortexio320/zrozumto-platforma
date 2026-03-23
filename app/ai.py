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
MODEL_NAME_LOW = "gemini-3.1-flash-lite-preview"
MODEL_NAME_HIGH = "gemini-3.1-pro-preview"

MIME_FALLBACKS = {".m4a": "audio/mp4", ".m4v": "video/mp4", ".webm": "video/webm"}

def _get_mime_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in MIME_FALLBACKS:
        return MIME_FALLBACKS[ext]
    guessed, _ = mimetypes.guess_type(path)
    return guessed or "application/octet-stream"


def _call_gemini_json(prompt: str) -> str:
    response = client.models.generate_content(
        model=MODEL_NAME_LOW,
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
            model=MODEL_NAME_LOW,
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
            model=MODEL_NAME_LOW,
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


CONFIDENCE_LABELS = {
    1: "niska (uczeń zgadywał)",
    2: "średnia (uczeń nie był pewien)",
    3: "wysoka (uczeń był pewien odpowiedzi)",
}


def check_task_answer(
    zadanie: dict,
    answer: str | None = None,
    image_base64: str | None = None,
    confidence: int = 2,
) -> dict:
    """Check a student's answer to an exam task using Gemini.

    Three modes:
    - Closed task, no whiteboard (answer only): text-based check
    - Closed task, with whiteboard (answer + image): vision check of both answer and reasoning
    - Open task (image only): vision check of the full solution
    """
    import base64

    tresc = zadanie.get("tresc", "")
    odpowiedzi = zadanie.get("odpowiedzi", [])
    typ = zadanie.get("typ", "")
    podtyp = zadanie.get("podtyp", "")
    punkty = zadanie.get("punkty", 1)
    tikz = zadanie.get("tikz", "")

    conf_label = CONFIDENCE_LABELS.get(confidence, CONFIDENCE_LABELS[2])

    task_description = f"""Zadanie egzaminacyjne (egzamin ósmoklasisty):
Typ: {typ} / {podtyp}
Punkty: {punkty}
Treść: {tresc}"""

    if odpowiedzi:
        task_description += f"\nWarianty odpowiedzi: {json.dumps(odpowiedzi, ensure_ascii=False)}"
    if tikz:
        task_description += f"\n(Zadanie zawiera rysunek pomocniczy w TikZ)"

    has_image = image_base64 is not None and len(image_base64) > 100

    if typ == "otwarte" or (has_image and not answer):
        # Open task: image-only evaluation
        image_bytes = base64.b64decode(image_base64)
        prompt = f"""{task_description}

Uczeń rozwiązał to zadanie otwarte na tablicy (rysunek/obliczenia widoczne na obrazie).
Pewność ucznia: {conf_label}

Przeanalizuj obraz z odpowiedzią ucznia i oceń:

WAŻNE:
- Dokładnie przeanalizuj to, co uczeń napisał/narysował.
- Oceń poprawność rozwiązania krok po kroku.
- Jeśli odpowiedź jest częściowo poprawna, uznaj ją za niepoprawną, ale doceń poprawne elementy.
- Bądź konstruktywny i motywujący.
- Jeśli pewność była wysoka a odpowiedź błędna, wskaż konkretne błędne przekonanie.
- Jeśli pewność była niska a odpowiedź poprawna, wzmocnij zrozumienie.
- Użyj notacji LaTeX w $...$ dla wzorów. W JSON escapuj backslash: \\\\frac.

Format JSON:
{{
  "poprawna_odpowiedz": true/false,
  "poprawne_rozumowanie": true/false,
  "uzasadnienie": "Szczegółowe uzasadnienie oceny..."
}}"""

        response = client.models.generate_content(
            model=MODEL_NAME_HIGH,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                prompt,
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )

    elif has_image and answer:
        # Closed task with whiteboard: check both answer AND reasoning
        image_bytes = base64.b64decode(image_base64)
        prompt = f"""{task_description}

Uczeń wybrał odpowiedź: {answer}
Pewność ucznia: {conf_label}

Uczeń DODATKOWO pokazał swoje obliczenia/rozumowanie na tablicy (obraz dołączony).

Oceń ODDZIELNIE:
1. Czy wybrana odpowiedź ({answer}) jest poprawna?
2. Czy rozumowanie pokazane na tablicy jest poprawne i prowadzi do właściwego wyniku?

WAŻNE SCENARIUSZE:
- Poprawna odpowiedź + poprawne rozumowanie = pełne opanowanie. Pochwal ucznia.
- Poprawna odpowiedź + BŁĘDNE rozumowanie = uczeń trafił, ale rozumowanie jest wadliwe. Wyjaśnij błąd w rozumowaniu i pokaż prawidłowy tok myślenia. To ważne — zgadywanie to nie nauka.
- Błędna odpowiedź + częściowo poprawne rozumowanie = doceń dobre elementy i wskaż gdzie nastąpił błąd.
- Błędna odpowiedź + błędne rozumowanie = wyjaśnij prawidłowe podejście od podstaw.

Bądź konstruktywny i motywujący. Użyj notacji LaTeX w $...$ dla wzorów. W JSON escapuj backslash: \\\\frac.

Format JSON:
{{
  "poprawna_odpowiedz": true/false,
  "poprawne_rozumowanie": true/false,
  "uzasadnienie": "Szczegółowe uzasadnienie..."
}}"""

        response = client.models.generate_content(
            model=MODEL_NAME_HIGH,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                prompt,
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )

    else:
        # Closed task, answer only (no whiteboard)
        prompt = f"""{task_description}

Uczeń wybrał odpowiedź: {answer}
Pewność ucznia: {conf_label}

Oceń, czy odpowiedź jest poprawna.

WAŻNE:
- Wyjaśnij DLACZEGO odpowiedź jest poprawna lub niepoprawna.
- Jeśli odpowiedź jest błędna, wyjaśnij prawidłowe rozwiązanie krok po kroku.
- Jeśli pewność była wysoka a odpowiedź błędna, wskaż konkretne błędne przekonanie ucznia.
- Jeśli pewność była niska a odpowiedź poprawna, wzmocnij zrozumienie ("Dobrze! Oto dlaczego...").
- Bądź konstruktywny i motywujący.
- Użyj notacji LaTeX w $...$ dla wzorów. W JSON escapuj backslash: \\\\frac.

Format JSON:
{{
  "poprawna_odpowiedz": true/false,
  "poprawne_rozumowanie": null,
  "uzasadnienie": "Szczegółowe uzasadnienie..."
}}"""

        response = client.models.generate_content(
            model=MODEL_NAME_HIGH,
            contents=[prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )

    clean = response.text.replace("```json", "").replace("```", "").strip()
    result = json.loads(clean)
    result = fix_latex_in_structure(result)

    uz = result.get("uzasadnienie", "")
    uz = uz.replace("\\n", "\n").replace("\\t", "\t")
    if "\x0c" in uz:
        uz = uz.replace("\x0c", "\\f")
    result["uzasadnienie"] = uz

    return result


def generate_task_hints_pair(zadanie: dict) -> dict:
    """Generate both hint levels in one call so they are distinct and properly graduated."""
    tresc = zadanie.get("tresc", "")
    odpowiedzi = zadanie.get("odpowiedzi", [])
    typ = zadanie.get("typ", "")
    podtyp = zadanie.get("podtyp", "")

    prompt = f"""Jesteś cierpliwym nauczycielem matematyki. Uczeń potrzebuje pomocy z zadaniem egzaminacyjnym.

Zadanie ({typ} / {podtyp}):
{tresc}
{f"Warianty odpowiedzi: {json.dumps(odpowiedzi, ensure_ascii=False)}" if odpowiedzi else ""}

Wygeneruj DWIE kolejne wskazówki (uczeń zobaczy je jedna po drugiej). Muszą być RÓŻNE i stopniowane:

1. hint_1 — DELIKATNA wskazówka: wskaż kierunek myślenia, przypomnij odpowiedni wzór lub koncepcję. NIE podawaj odpowiedzi ani kroków rozwiązania.

2. hint_2 — MOCNIEJSZA wskazówka: pokaż pierwszy krok rozwiązania lub wskaż konkretną metodę. NIE podawaj końcowej odpowiedzi.

WAŻNE:
- hint_2 musi być MOCNIEJSZA niż hint_1 — pokazuj więcej, ale nadal nie zdradzaj odpowiedzi.
- NIE podawaj odpowiedzi w żadnej z wskazówek!
- Bądź motywujący i cierpliwy.
- Użyj notacji LaTeX w $...$ dla wzorów. W JSON escapuj backslash: \\\\frac.

Format JSON:
{{
  "hint_1": "Treść pierwszej (delikatnej) wskazówki...",
  "hint_2": "Treść drugiej (mocniejszej) wskazówki..."
}}"""

    raw = _call_gemini_json(prompt)
    clean = raw.replace("```json", "").replace("```", "").strip()
    result = json.loads(clean)
    result = fix_latex_in_structure(result)
    return result


def generate_worked_example(zadanie: dict) -> dict:
    """Generate a step-by-step worked solution for a task."""
    tresc = zadanie.get("tresc", "")
    odpowiedzi = zadanie.get("odpowiedzi", [])
    typ = zadanie.get("typ", "")
    podtyp = zadanie.get("podtyp", "")

    prompt = f"""Jesteś najlepszym nauczycielem matematyki. Rozwiąż to zadanie egzaminacyjne krok po kroku.

Zadanie ({typ} / {podtyp}):
{tresc}
{f"Warianty odpowiedzi: {json.dumps(odpowiedzi, ensure_ascii=False)}" if odpowiedzi else ""}

ZASADY:
- Rozwiąż KROK PO KROKU, numerując każdy krok.
- Wyjaśnij KAŻDY krok prostym językiem, jakbyś tłumaczył 14-latkowi.
- Pokaż tok rozumowania — dlaczego wybieramy daną metodę.
- Na końcu podaj ostateczną odpowiedź.
- Użyj notacji LaTeX w $...$ dla wzorów. W JSON escapuj backslash: \\\\frac.

Format JSON:
{{
  "steps": "Krok 1: ...\\nKrok 2: ...\\n...\\nOdpowiedź: ..."
}}"""

    response = client.models.generate_content(
        model=MODEL_NAME_HIGH,
        contents=[prompt],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    raw = response.text
    clean = raw.replace("```json", "").replace("```", "").strip()
    result = json.loads(clean)
    result = fix_latex_in_structure(result)
    steps = result.get("steps", "")
    steps = steps.replace("\\n", "\n").replace("\\t", "\t")
    result["steps"] = steps
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
