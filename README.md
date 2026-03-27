# ZrozumTo — AI-Powered Learning Platform

**ZrozumTo** is an intelligent educational platform that combines structured lessons, adaptive practice, and **Google Gemini**-driven tutoring. Students work through content with math rendering, interactive diagrams, and exam-style tasks backed by a **Neo4j** skill graph—while teachers and automation (e.g. **n8n**) keep content flowing.

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11" />
  <img src="https://img.shields.io/badge/Neo4j-008CC1?style=flat-square&logo=neo4j&logoColor=white" alt="Neo4j" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Gemini%20AI-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini AI" />
</p>

---

## Features

- **Lesson & quiz workflow** — Upload-based **quiz generation** from lesson materials, results tracking, **AI analysis** of answers, **flashcards**, and **“more questions”** flows that spawn new quizzes with configurable difficulty.
- **Interactive canvas for open tasks** — Built-in **scratch canvas** (`react-sketch-canvas`) so students can sketch work for open-ended items; submissions can include **canvas snapshots** for review.
- **Gemini Vision task checking** — **POST `/tasks/check`** validates answers with **Gemini**, including **vision** when an image is provided—aligned with exam-style open problems.
- **Hints & worked examples** — Tiered **AI hints** (paired generation) and **worked examples** after incorrect attempts, with server-side caching where applicable.
- **Neo4j skill tree** — Graph model for **sections (Dział)**, **skills**, and **tasks** with relationships such as **requires** / **checks**; powers recommendations and the **skill map** UI.
- **Adaptive task engine** — **Mastery**, **spaced repetition** (e.g. 1/3/7/14-day spacing), **interleaving**, and focus on weaker skills; **admin skill locks** per student.
- **TikZ → SVG pipeline** — Server-side **LaTeX** compilation (**pdflatex** + **pdf2svg**) for crisp diagrams in the browser, with a documented fallback path.
- **KaTeX math** — Rich mathematical notation in task and lesson content.
- **Automation-ready** — **Webhook ingest** (shared secret) for **n8n** or similar: zip unpack, lesson creation, and **background processing** (summaries, quizzes).
- **Supabase-backed** — **PostgreSQL**, auth-compatible flows, **RLS** on data paths, and **HTTP-only cookies** for session tokens with optional **Bearer** usage.

---

## Architecture (short)

| Layer        | Stack |
|-------------|--------|
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS 4, KaTeX |
| **Backend**  | FastAPI, Uvicorn, Pydantic, Supabase Python client, `google-genai`, Neo4j driver |
| **Data**     | Supabase (Postgres + auth), Neo4j (skill graph) |
| **AI**       | Google Gemini (quizzes, analysis, task check, hints, examples) |
| **Ops**      | Docker / Docker Compose (API + Neo4j + optional n8n) |

For more detail, see [`architecture.md`](architecture.md).

---

## How to run locally

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- A **Supabase** project (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_ANON_KEY`)
- A **Google AI / Gemini** API key (`GOOGLE_API_KEY`)

### 1. Configure environment

Copy the example file and fill in secrets:

```bash
cp .env.example .env
```

See [`.env.example`](.env.example) for all variables. At minimum set:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_ANON_KEY` | Backend + client config |
| `GOOGLE_API_KEY` | Gemini features |
| `NEO4J_AUTH` | Neo4j credentials (`neo4j/<password>` style); used by the `neo4j` service |
| `WEBHOOK_SECRET` | If you exercise `/webhooks/ingest` |

`docker-compose.yml` injects `NEO4J_URI=bolt://neo4j:7687` into the **`web`** container so the API reaches Neo4j on the Compose network. For tools on your host (e.g. Neo4j Browser), Bolt is mapped to **`127.0.0.1:7688`** → container `7687`.

### 2. Start services

From the repository root:

```bash
docker compose up --build
```

- **API + static UI:** [http://localhost:8000](http://localhost:8000) (Vite build is copied into the image; see `Dockerfile`)
- **Neo4j Browser (mapped locally):** [http://127.0.0.1:7474](http://127.0.0.1:7474)
- **n8n** (optional, if you use the bundled service): [http://localhost:5678](http://localhost:5678)

### 3. Development mode (optional)

To run the **React** dev server with hot reload and proxy API calls:

```bash
cd frontend
npm ci
npm run dev
```

Vite listens on **port 5173** and proxies `/auth`, `/lessons`, `/quizzes`, `/admin`, `/tasks`, `/api` to `VITE_PROXY_TARGET` (default `http://localhost:8000`). Run the FastAPI app on the host with the same `.env` (and Neo4j reachable at `NEO4J_URI`), e.g.:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Ensure `CORS_ORIGINS` includes `http://localhost:5173` if you hit the API directly from the browser.

---

## Security & cloud cost management

- **Authenticated API usage** — Routes that trigger **Gemini** (quizzes, task check, hints, worked examples, etc.) and other student/teacher APIs use **`Depends(get_current_user)`**: the server validates a **Supabase JWT** from an **`Authorization: Bearer <token>`** header **or** an **`access_token` HTTP-only cookie**. Unauthenticated callers cannot invoke these endpoints, which reduces **API key abuse** and uncontrolled **Gemini** spend.
- **Admin isolation** — **`/admin/*`** endpoints require **`require_admin`**: the same JWT must represent a user whose profile **`role`** is **`admin`**. This blocks unauthorized access to user management, progress views, quiz deletion, lesson edits, and per-student skill locks.
- **Webhook hardening** — **`/webhooks/ingest`** expects a configured **`WEBHOOK_SECRET`** so only your automation (e.g. n8n) can trigger ingest pipelines.
- **Least exposure** — The **service role** Supabase key stays **server-side**; the frontend receives only the **anon** key via **`/api/config`** as intended for Supabase client usage.

Treat **`.env`** as secret—never commit it. Rotate **API keys** if exposed.

---

## License

Add a `LICENSE` file if you plan to open-source this repository.
