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
| **python-multipart** | Obsługa uploadu plików |

### Frontend
| Technologia | Zastosowanie |
|-------------|--------------|
| **Vanilla JavaScript** | Aplikacja SPA bez frameworka |
| **Tailwind CSS** (CDN) | Stylowanie |
| **Inter** (Google Fonts) | Typografia |

### Baza danych
| Technologia | Zastosowanie |
|-------------|--------------|
| **Supabase (PostgreSQL)** | Główna baza danych |
| **Row Level Security (RLS)** | Kontrola dostępu |

### Infrastruktura
| Technologia | Zastosowanie |
|-------------|--------------|
| **Docker** | Konteneryzacja |
| **Docker Compose** | Serwisy web + n8n |
| **n8n** | Automatyzacja i webhooki |

---

## Struktura katalogów

```
zrozumto-platforma/
├── app/
│   ├── main.py              # Aplikacja FastAPI, CORS, routing, serwowanie statyków
│   ├── ai.py                # Integracja z Gemini (quizy, fiszki, analiza)
│   ├── services.py          # Klient Supabase
│   ├── schemas.py           # Modele Pydantic
│   ├── dependencies.py      # Autentykacja (Bearer, admin)
│   ├── worker.py            # Zadania w tle (przetwarzanie webhooków)
│   └── routers/
│       ├── auth.py          # Login, /auth/me
│       ├── lessons.py       # CRUD lekcji
│       ├── quizzes.py       # Generowanie quizów, wyniki, fiszki, analiza
│       ├── admin.py         # Użytkownicy, postępy uczniów, edycja lekcji
│       └── webhooks.py      # Integracja z n8n (ingest)
├── static/
│   ├── index.html           # UI SPA
│   └── script.js            # Logika klienta
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

| Tabela | Opis |
|--------|------|
| **profiles** | Rozszerzenie auth.users (username, role, full_name) |
| **lessons** | title, description, file_url, transcript |
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
| `/quizzes/{id}/more` | POST | Generowanie dodatkowych pytań |
| `/quizzes/{id}/flashcards` | POST | Generowanie fiszek |
| `/quizzes/{id}/analysis` | POST | Analiza AI odpowiedzi |
| `/admin/users` | GET/POST | Lista/tworzenie użytkowników |
| `/admin/users/{username}` | DELETE | Usunięcie użytkownika |
| `/admin/students/{id}/progress` | GET | Postępy ucznia (lekcje, quizy, wyniki) |
| `/admin/lessons/{id}` | PATCH | Edycja tytułu/opisu lekcji |
| `/webhooks/ingest` | POST | Webhook n8n (tworzenie lekcji + przetwarzanie w tle) |

### 3.4 Stan frontendu

| Stan | Opis |
|------|------|
| **Session** | `accessToken`, `currentUserInfo` (też w sessionStorage) |
| **Quiz** | `quizState` – pytania, quizId, currentIndex, answers, submitted |
| **Dialogi** | `moreOpts` (count, difficulty), `flashcardState` (karty, index) |
| **Widoki** | `login`, `dashboard`, `lesson`, `admin` |

### 3.5 Przykładowe przepływy

#### Dashboard → Lekcje

```
1. loadLessons() → GET /lessons/ (Bearer token)
2. Backend pobiera lesson_assignments dla użytkownika, potem lekcje
3. RLS ogranicza lekcje do przypisanych
```

#### Generowanie quizu (upload użytkownika)

```
1. Użytkownik wybiera plik i klika „Generuj”
2. POST /quizzes/generate?lesson_id=... z FormData (plik)
3. Backend zapisuje plik tymczasowo, wywołuje generate_quiz_content() (Gemini)
4. Wynik zapisywany w quizzes, odpowiedź zwraca dane quizu
5. Frontend przełącza na widok quizu
```

#### Webhook (n8n → backend)

```
1. n8n wysyła POST /webhooks/ingest z X-Webhook-Secret, student_username, title, pliki
2. Backend weryfikuje secret, znajduje użytkownika, tworzy lekcję, przypisuje do ucznia
3. BackgroundTasks.add_task(process_ingested_content, lesson_id, temp_paths)
4. Worker: AI summary → aktualizacja lekcji, AI quiz → wstawienie quizu
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
| **More questions** | `generate_more_questions(existing, count, difficulty)` → dołączenie do quizu |

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
