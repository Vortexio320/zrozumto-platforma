# Architektura – ZrozumTo Platforma

## Technologie

### Backend
| Technologia | Zastosowanie |
|-------------|--------------|
| **Python 3.11** | Środowisko wykonawcze |
| **FastAPI** | Framework webowy |
| **Uvicorn** | Serwer ASGI |
| **Pydantic** | Walidacja request/response |
| **Supabase** | Backend-as-a-Service (PostgreSQL, auth, storage) |
| **google-genai** | Integracja z Google Gemini (quizy, fiszki, analiza, sprawdzanie zadań) |
| **python-dotenv** | Zmienne środowiskowe |
| **httpx** | Klient HTTP |
| **neo4j** | Klient Neo4j (graf wiedzy: Dzial, Umiejetnosc, Zadanie) |
| **python-multipart** | Obsługa uploadu plików |
| **texlive + ghostscript + pdf2svg** | Renderowanie TikZ → SVG (zadania egzaminacyjne) |

### Frontend
| Technologia | Zastosowanie |
|-------------|--------------|
| **React 19** | Biblioteka UI (SPA) |
| **TypeScript** | Typowanie statyczne |
| **Vite 6** | Bundler i dev server |
| **Tailwind CSS 4** | Stylowanie (PostCSS) |
| **KaTeX** | Renderowanie wzorów matematycznych (MathContent) |
| **react-sketch-canvas** | Tablica rysunkowa (odpowiedzi otwarte, ScratchCanvas) |
| **Inter** (Google Fonts) | Typografia |
| **TikzRenderer** | Diagramy TikZ (POST /api/tikz-svg → SVG) |

### Baza danych
| Technologia | Zastosowanie |
|-------------|--------------|
| **Supabase (PostgreSQL)** | Główna baza danych |
| **Row Level Security (RLS)** | Kontrola dostępu |
| **Neo4j** | Graf wiedzy: Dzial, Umiejetnosc, Zadanie; relacje ZAWIERA, WYMAGA, SPRAWDZA (neo4j_schema.md) |

### Infrastruktura
| Technologia | Zastosowanie |
|-------------|--------------|
| **Docker** | Konteneryzacja |
| **Docker Compose** | Serwisy web + n8n + Neo4j |
| **n8n** | Automatyzacja i webhooki |

---

## Struktura katalogów

```
zrozumto-platforma/
├── app/
│   ├── main.py              # FastAPI, CORS, routing, /api/tikz-svg, serwowanie statyków
│   ├── ai.py                # Gemini: quizy, fiszki, analiza, check_task_answer, hint, worked_example
│   ├── skill_engine.py      # Rekomendacje zadań (mastery, spaced repetition, interleaving; bez blokady prereq)
│   ├── services.py          # Klient Supabase
│   ├── neo4j.py             # Klient Neo4j (driver, init, dependency)
│   ├── schemas.py           # Modele Pydantic
│   ├── dependencies.py      # Autentykacja (Bearer, admin)
│   ├── worker.py            # Zadania w tle (przetwarzanie webhooków)
│   └── routers/
│       ├── auth.py          # Login, /auth/me
│       ├── lessons.py       # CRUD lekcji
│       ├── quizzes.py       # Generowanie quizów, wyniki, fiszki, analiza
│       ├── tasks.py         # Zadania egzaminacyjne (Neo4j + Supabase)
│       ├── admin.py         # Użytkownicy, postępy uczniów, edycja lekcji
│       └── webhooks.py      # Integracja z n8n (ingest)
├── frontend/
│   ├── src/
│   │   ├── main.tsx             # Entry point
│   │   ├── App.tsx              # Główny komponent (routing widoków)
│   │   ├── index.css            # Tailwind + style flip-card
│   │   ├── api/client.ts        # Wrapper fetch z auth headers
│   │   ├── context/AuthContext.tsx # React Context (token, user, login/logout)
│   │   ├── types/index.ts       # Interfejsy TypeScript (Lesson, Quiz, User...)
│   │   ├── components/          # Navbar, MathContent, TikzRenderer, TaskRenderer, TaskResultPanel, ScratchCanvas, SkillMap, Spinner, quiz sub-views
│   │   └── views/               # LoginView, DashboardView, LessonView, TasksView, AdminView
│   ├── index.html               # Vite entry HTML
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── static/                      # Vite build output (generowany, nie edytować)
├── setup_db.sql             # Schemat Supabase i RLS
├── requirements.txt
├── docker-compose.yml
├── Dockerfile
├── README.md
└── .env                     # Sekrety (gitignore)
```

---

## Przepływ danych

### 3.1 Autentykacja

1. Użytkownik loguje się loginem i hasłem.
2. `POST /auth/login` mapuje username na `username@zrozum-to.pl` i wywołuje Supabase Auth.
3. Odpowiedź: JSON z `access_token`, `refresh_token`, `user` oraz HTTP-only cookies (`access_token`, `refresh_token`).
4. Frontend używa cookies (credentials: include); token nie jest przechowywany w JS. Sesja persystuje między odświeżeniami i nowymi kartami.
5. `POST /auth/refresh` odświeża tokeny z cookie `refresh_token`. `POST /auth/logout` czyści cookies.

### 3.2 Modele danych (Supabase)

**profiles** – pola `school_type` i `class` (dla uczniów):
- `school_type`: `'liceum'` | `'podstawowka'`
- `class`: klasa – Liceum: 1–4, Podstawówka: 4–8

| Tabela | Opis |
|--------|------|
| **profiles** | Rozszerzenie auth.users (username, role, full_name, school_type, class) |
| **lessons** | title, description, lesson_date, file_url, transcript |
| **lesson_assignments** | Przypisania lekcji do uczniów |
| **quizzes** | lesson_id, questions_json (tablica pytań) |
| **quiz_results** | user_id, quiz_id, score, details_json |
| **task_attempts** | user_id, zadanie_id, correct, hints_used, confidence, image_base64 |
| **worked_examples** | zadanie_id, content (przykład rozwiązania od AI) |
| **student_skill_locks** | user_id, skill_id, locked_by – admin blokuje umiejętności dla ucznia |
| **storage** | Buckety: `lessons`, `avatars` |

### 3.3 Endpointy API i ich zadania

| Ścieżka | Metoda | Opis |
|---------|--------|------|
| `/api/config` | GET | URL i klucz anon Supabase dla frontendu |
| `/api/tikz-svg` | POST | TikZ → SVG: pdflatex → (opcjonalnie gs -dNoOutputFonts) → pdf2svg; body: `{t: base64}` |
| `/api/tikz-frame` | GET | Fallback: iframe z tikzjax (ma problemy z nullfont) |
| `/tasks/dzialy` | GET | Lista działów z Neo4j |
| `/tasks/recommended` | GET | Zadanie rekomendowane (skill_engine) |
| `/tasks/random` | GET | Losowe zadanie |
| `/tasks/dzial/{id}` | GET | Zadania z działu |
| `/tasks/all` | GET | Wszystkie zadania (tymczasowe, skip/limit) |
| `/tasks/{id}` | GET | Pojedyncze zadanie |
| `/tasks/check` | POST | Sprawdzenie odpowiedzi (AI + image) |
| `/tasks/hint` | POST | Podpowiedź AI |
| `/tasks/worked-example` | POST | Przykład rozwiązania AI |
| `/tasks/skill-map` | GET | Mapa umiejętności ucznia |
| `/auth/login` | POST | Logowanie loginem i hasłem (ustawia cookies) |
| `/auth/refresh` | POST | Odświeżenie tokenów z cookie refresh_token |
| `/auth/logout` | POST | Wylogowanie (czyści cookies) |
| `/auth/me` | GET | Profil zalogowanego użytkownika |
| `/lessons/` | GET | Lekcje przypisane do użytkownika |
| `/lessons/` | POST | Tworzenie lekcji (+ przypisanie) |
| `/lessons/{id}` | GET | Pojedyncza lekcja |
| `/quizzes/{lesson_id}` | GET | Quizy do lekcji |
| `/quizzes/generate` | POST | Generowanie quizu z pliku |
| `/quizzes/{id}/results` | POST | Zapis odpowiedzi i wyniku |
| `/quizzes/{id}/more` | POST | Tworzenie nowego quizu z dodatkowymi pytaniami (na podstawie istniejącego) |
| `/quizzes/{id}/flashcards` | POST | Generowanie fiszek |
| `/quizzes/{id}/analysis` | POST | Analiza AI odpowiedzi |
| `/admin/users` | GET/POST | Lista/tworzenie użytkowników |
| `/admin/users/{user_id}` | PATCH | Aktualizacja ucznia (school_type, class) |
| `/admin/users/{username}` | DELETE | Usunięcie użytkownika |
| `/admin/quizzes/{quiz_id}` | DELETE | Usunięcie quizu (admin, usuwa też quiz_results) |
| `/admin/students/{id}/progress` | GET | Postępy ucznia (lekcje, quizy, wyniki) |
| `/admin/students/{user_id}/skill-map` | GET | Mapa umiejętności ucznia (dla admina: blokowanie) |
| `/admin/students/{user_id}/locked-skills` | GET | Lista zablokowanych umiejętności |
| `/admin/students/{user_id}/lock-skill` | POST | Zablokuj umiejętność (body: { skill_id }) |
| `/admin/students/{user_id}/locked-skills/{skill_id}` | DELETE | Odblokuj umiejętność |
| `/admin/lessons/{id}` | PATCH | Edycja tytułu/opisu lekcji |
| `/webhooks/ingest` | POST | Webhook n8n (tworzenie lekcji + przetwarzanie w tle) |

### 3.4 Stan frontendu (React)

| Warstwa | Mechanizm | Opis |
|---------|-----------|------|
| **Auth** | `AuthContext` (React Context) | `user`, `login()`, `logout()` – sesja w HTTP-only cookies, init przez GET /auth/me |
| **Widoki** | `App.tsx` useState | `View` union type: `dashboard`, `lesson(Lesson)`, `admin` |
| **Quiz flow** | `LessonView` local state | `subView`, `activeQuestions`, `activeQuizId`, `resultAnswers` |
| **Komponenty** | Local useState w komponentach | Flashcards index, more-questions count/difficulty, form inputs |
| **API** | `api/client.ts` | Centralized `fetch` wrapper z auto-auth i obsługą 401 |

### 3.5 Przykładowe przepływy

#### Dashboard → Lekcje

```
1. loadLessons() → GET /lessons/ (Bearer token)
2. Backend pobiera lesson_assignments dla użytkownika, potem lekcje
3. RLS ogranicza lekcje do przypisanych
```

#### Lekcja → Lista quizów

```
1. Użytkownik klika lekcję → openLesson(lesson)
2. GET /quizzes/{lesson_id} zwraca tablicę quizów
3. Jeśli quizy istnieją: pokazana lista quizów (quiz-list-section)
4. Jeśli brak quizów: pokazana sekcja uploadu
5. Przy pierwszym wejściu (webhook/ingest): worker tworzy 1 quiz → uczeń widzi 1 pozycję
```

#### Generowanie quizu (upload użytkownika)

```
1. Użytkownik wybiera plik i klika „Generuj”
2. POST /quizzes/generate?lesson_id=... z FormData (plik)
3. Backend zapisuje plik tymczasowo, wywołuje generate_quiz_content() (Gemini)
4. Wynik zapisywany w quizzes, odpowiedź zwraca dane quizu
5. Frontend przełącza na widok quizu
```

#### Więcej pytań → nowy quiz

```
1. Uczeń kończy quiz, klika „Więcej pytań” → wybiera liczbę i trudność
2. POST /quizzes/{quiz_id}/more z { count, difficulty }
3. Backend: generate_more_questions() → tworzy NOWY wiersz w quizzes (ten sam lesson_id)
4. Zwraca { quiz, id } – nowy quiz z samymi nowymi pytaniami
5. Frontend startQuiz(data.quiz, data.id) – uczeń rozwiązuje tylko nowe pytania
```

#### Webhook (n8n → backend)

```
1. n8n pakuje pliki lekcji (audio, zdjęcia) w jeden .zip i wysyła POST /webhooks/ingest
   z X-Webhook-Secret, student_username, title, plik .zip (lub pojedyncze pliki – oba tryby obsługiwane)
2. Backend weryfikuje secret, znajduje użytkownika
3. Jeśli plik to .zip → rozpakowuje do temp (pomija __MACOSX, ukryte pliki; max 20 plików)
4. Tworzy jedną lekcję, przypisuje do ucznia
5. BackgroundTasks.add_task(process_ingested_content, lesson_id, temp_paths)
6. Worker: AI summary → aktualizacja lekcji, AI quiz → wstawienie quizu
7. Worker: cleanup temp plików i rozpakowanych katalogów
```

#### Wysłanie quizu

```
1. Użytkownik kończy quiz → POST /quizzes/{id}/results z { answers }
2. Backend używa get_admin_supabase() (omija RLS)
3. Oblicza wynik i details_json, wstawia do quiz_results
4. Zwraca wynik
```

#### Zadania egzaminacyjne (podstawówka 7–8)

```
1. Uczeń z school_type=podstawowka i class=7|8 widzi kartę „Zadania egzaminacyjne” na Dashboard
2. TasksView: tryby Recommended / Random / By Dzial (Neo4j: Dzial, Umiejetnosc, Zadanie)
3. TaskRenderer: tresc (KaTeX), tikz (TikzRenderer → POST /api/tikz-svg), odpowiedzi (wielokrotny wybór, P/F, dobieranie, wybór uzasadnienia); zadania otwarte: wbudowana tablica (ScratchCanvas, zawsze widoczna); tryb „Wszystkie zadania” (tymczasowy) – lista wszystkich zadań z Neo4j
4. Pedagogiczne: confidence rating (1-3), podpowiedzi (POST /tasks/hint, max 2), worked example po błędnej (POST /tasks/worked-example, cache)
5. SkillMap.tsx: mapa umiejętności (GET /tasks/skill-map) – statusy mastered/in_progress/available/locked (locked tylko przez admina), WYMAGA edges
6. Sprawdzenie: POST /tasks/check z answer, image_base64, confidence, hints_used → AI analiza
7. skill_engine: mastery z task_attempts, spaced repetition (1/3/7/14 dni), interleaving, priorytet najsłabszych umiejętności; student_skill_locks (admin tylko dla blokady)
```

#### Pipeline TikZ → SVG

```
1. Frontend: TikzRenderer wysyła POST /api/tikz-svg { t: base64(tikz_code) }
2. Backend: _prepare_tikz (polskie znaki → ASCII, usunięcie font=\sffamily)
3. pdflatex: standalone + amsmath + usetikzlibrary → PDF
4. (opcjonalnie) gs -dNoOutputFonts -sDEVICE=pdfwrite: fonty → ścieżki (etykiety w SVG)
5. pdf2svg: PDF → SVG
6. Zwrot: image/svg+xml
```

#### Funkcje AI (Gemini)

| Funkcja | Opis |
|---------|------|
| **Analysis** | `generate_analysis(questions, answers)` → JSON (mocne_strony, obszary_do_poprawy, wskazowki) |
| **Flashcards** | `generate_flashcards(questions)` → tablica `[{przod, tyl}]` |
| **More questions** | `generate_more_questions(existing, count, difficulty)` → nowe pytania; endpoint tworzy nowy quiz |
| **Task check** | `check_task_answer(zadanie, answer, image_base64)` → {correct, feedback, reasoning}; dla zadań otwartych: image_base64 (vision); |
| **Task hint** | `generate_task_hints_pair(zadanie)` → hint_1 + hint_2 (obie w jednym wywołaniu, frontend przechowuje hint_2 do drugiego użycia); |
| **Worked example** | `generate_worked_example(zadanie)` → przykład rozwiązania; |

### 3.6 Autoryzacja

| Mechanizm | Opis |
|-----------|------|
| **Bearer** | Chronione trasy: `Depends(get_current_user)`, walidacja JWT przez Supabase |
| **Admin** | `require_admin` sprawdza `profile.role == "admin"` dla `/admin/*` |
| **Admin Supabase** | Klucz service role omija RLS przy zapisach wyników i operacjach administracyjnych |

---

## Diagram przepływu danych (uproszczony)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   FastAPI   │────▶│  Supabase   │
│  (static)   │     │   (app/)    │     │ (Postgres)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
       │                   │
       │                   ├──────────▶┌─────────────┐
       │                   │           │    Neo4j     │
       │                   │           │   (graf)    │
       │                   │           └─────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │   Gemini    │
       │            │  (AI/quiz)  │
       │            └─────────────┘
       │                   ▲
       │                   │
┌──────┴──────┐     ┌──────┴──────┐
│     n8n     │────▶│  Webhooks   │
│ (workflows)  │     │   /ingest   │
└─────────────┘     └─────────────┘
```
