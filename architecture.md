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
| **google-genai** | Integracja z Google Gemini (quizy, fiszki, analiza) |
| **python-dotenv** | Zmienne środowiskowe |
| **httpx** | Klient HTTP |
| **neo4j** | Klient Neo4j (graf wiedzy) |
| **python-multipart** | Obsługa uploadu plików |

### Frontend
| Technologia | Zastosowanie |
|-------------|--------------|
| **React 19** | Biblioteka UI (SPA) |
| **TypeScript** | Typowanie statyczne |
| **Vite 6** | Bundler i dev server |
| **Tailwind CSS 4** | Stylowanie (PostCSS) |
| **KaTeX** | Renderowanie wzorów matematycznych |
| **react-sketch-canvas** | Tablica rysunkowa (odpowiedzi otwarte) |
| **Inter** (Google Fonts) | Typografia |

### Baza danych
| Technologia | Zastosowanie |
|-------------|--------------|
| **Supabase (PostgreSQL)** | Główna baza danych |
| **Row Level Security (RLS)** | Kontrola dostępu |
| **Neo4j** | Graf wiedzy (opcjonalnie: koncepty, powiązania między lekcjami) |

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
│   ├── main.py              # Aplikacja FastAPI, CORS, routing, serwowanie statyków
│   ├── ai.py                # Integracja z Gemini (quizy, fiszki, analiza)
│   ├── services.py          # Klient Supabase
│   ├── neo4j.py             # Klient Neo4j (driver, init, dependency)
│   ├── schemas.py           # Modele Pydantic
│   ├── dependencies.py      # Autentykacja (Bearer, admin)
│   ├── worker.py            # Zadania w tle (przetwarzanie webhooków)
│   └── routers/
│       ├── auth.py          # Login, /auth/me
│       ├── lessons.py       # CRUD lekcji
│       ├── quizzes.py       # Generowanie quizów, wyniki, fiszki, analiza
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
│   │   ├── components/          # Navbar, MathContent, Spinner, quiz sub-views
│   │   └── views/               # LoginView, DashboardView, LessonView, AdminView, WhiteboardView
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
3. Odpowiedź: JWT `access_token` oraz dane użytkownika (id, username, role).
4. Frontend trzyma token w `sessionStorage` i wysyła go w nagłówku `Authorization: Bearer <token>`.

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
| **storage** | Buckety: `lessons`, `avatars` |

### 3.3 Endpointy API i ich zadania

| Ścieżka | Metoda | Opis |
|---------|--------|------|
| `/api/config` | GET | URL i klucz anon Supabase dla frontendu |
| `/auth/login` | POST | Logowanie loginem i hasłem |
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
| `/admin/lessons/{id}` | PATCH | Edycja tytułu/opisu lekcji |
| `/admin/whiteboard/analyze` | POST | Analiza odpowiedzi otwartej (obraz + pytanie → Gemini vision) |
| `/webhooks/ingest` | POST | Webhook n8n (tworzenie lekcji + przetwarzanie w tle) |

### 3.4 Stan frontendu (React)

| Warstwa | Mechanizm | Opis |
|---------|-----------|------|
| **Auth** | `AuthContext` (React Context) | `token`, `user`, `login()`, `logout()` – persystowane w sessionStorage |
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

#### Tablica – odpowiedź otwarta (admin test)

```
1. Admin wpisuje pytanie otwarte i klika „Otwórz tablicę"
2. WhiteboardView: react-sketch-canvas (pen, eraser, undo, clear, kolory, grubość)
3. Admin rysuje/pisze odpowiedź i klika „Sprawdź odpowiedź"
4. Eksport canvas → PNG (base64), POST /admin/whiteboard/analyze { question, image_base64 }
5. Backend: analyze_open_answer() → Gemini vision analizuje obraz
6. Odpowiedź: { poprawna: bool, uzasadnienie: string }
7. Frontend wyświetla wynik (poprawna/niepoprawna + uzasadnienie)
```

#### Wysłanie quizu

```
1. Użytkownik kończy quiz → POST /quizzes/{id}/results z { answers }
2. Backend używa get_admin_supabase() (omija RLS)
3. Oblicza wynik i details_json, wstawia do quiz_results
4. Zwraca wynik
```

#### Funkcje AI (Gemini)

| Funkcja | Opis |
|---------|------|
| **Analysis** | `generate_analysis(questions, answers)` → JSON (mocne_strony, obszary_do_poprawy, wskazowki) |
| **Flashcards** | `generate_flashcards(questions)` → tablica `[{przod, tyl}]` |
| **More questions** | `generate_more_questions(existing, count, difficulty)` → nowe pytania; endpoint tworzy nowy quiz |
| **Open answer** | `analyze_open_answer(question, image_base64)` → Gemini vision analizuje obraz odpowiedzi → `{poprawna, uzasadnienie}` |

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
