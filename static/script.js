// Supabase Configuration
const SUPABASE_URL = "[REDACTED]";
const SUPABASE_ANON_KEY = "[REDACTED]";

const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let currentUser = null;
let currentSession = null;

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    dashboard: document.getElementById('dashboard-view'),
    lesson: document.getElementById('lesson-view'),
};

// --- Auth Functions ---

async function signInWithPassword() {
    console.log("Button clicked: signInWithPassword");
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('auth-message');
    const btn = document.getElementById('login-btn');

    if (!email || !password) {
        msg.innerText = "Podaj email i hasło.";
        msg.classList.remove('hidden');
        return;
    }

    msg.classList.add('hidden');
    btn.disabled = true;
    btn.innerText = "Logowanie...";

    const { data, error } = await sbClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    btn.disabled = false;
    btn.innerText = "Zaloguj";

    if (error) {
        msg.innerText = "Błąd: " + error.message;
        msg.classList.remove('hidden');
    }
    // Success will be handled by onAuthStateChange
}

async function signUpWithPassword() {
    console.log("Button clicked: signUpWithPassword");
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('auth-message');
    const btn = document.getElementById('signup-btn');

    if (!email || !password) {
        msg.innerText = "Podaj email i hasło.";
        msg.classList.remove('hidden');
        return;
    }

    msg.classList.add('hidden');
    btn.disabled = true;
    btn.innerText = "Rejestracja...";

    const { data, error } = await sbClient.auth.signUp({
        email: email,
        password: password
    });

    btn.disabled = false;
    btn.innerText = "Zarejestruj";

    if (error) {
        msg.innerText = "Błąd: " + error.message;
        msg.classList.remove('hidden');
    } else {
        msg.innerText = "Konto utworzone! Jeśli wymagane potwierdzenie, sprawdź email, lub spróbuj się zalogować.";
        msg.className = "text-sm text-center text-green-600";
        msg.classList.remove('hidden');
    }
}

// Check Session on Load
window.onload = async () => {
    try {
        const { data: { session }, error } = await sbClient.auth.getSession();
        if (error) console.error("Error getting session:", error);
        handleSession(session);
    } catch (err) {
        console.error("Critical error in window.onload:", err);
    }

    sbClient.auth.onAuthStateChange((_event, session) => {
        handleSession(session);
    });
};

function handleSession(session) {
    currentSession = session;
    currentUser = session?.user;

    if (currentUser) {
        showView('dashboard');
        loadLessons();
        document.getElementById('user-email').innerText = currentUser.email;
    } else {
        showView('login');
    }
}

async function signOut() {
    await sbClient.auth.signOut();
}

// --- Navigation ---

function showView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
}

// --- Data & Logic ---

async function createTestLesson() {
    const title = prompt("Podaj tytuł nowej lekcji:");
    if (!title) return;

    const token = currentSession.access_token;

    try {
        const response = await fetch('/lessons/', {
            method: 'POST',
            body: JSON.stringify({ title: title, description: "Lekcja utworzona automatycznie" }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            alert("Dodano lekcję!");
            loadLessons();
        } else {
            const err = await response.json();
            console.error("Error creating lesson:", err);
            alert("Błąd dodawania lekcji: " + (err.detail || JSON.stringify(err)));
        }
    } catch (e) {
        console.error(e);
    }
}

async function loadLessons() {
    // Call our Backend API which uses Supabase Client + RLS
    // We need to pass the JWT token in headers

    const token = currentSession.access_token;

    try {
        const response = await fetch('/lessons/', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch lessons');

        const lessons = await response.json();
        renderLessonsList(lessons);
    } catch (e) {
        console.error(e);
        document.getElementById('lessons-list').innerHTML = '<p class="text-red-500">Nie udało się pobrać lekcji.</p>';
    }
}

function renderLessonsList(lessons) {
    const list = document.getElementById('lessons-list');
    list.innerHTML = '';

    if (lessons.length === 0) {
        list.innerHTML = '<p class="text-gray-500">Brak przypisanych lekcji.</p>';
        return;
    }

    lessons.forEach(lesson => {
        const el = document.createElement('div');
        el.className = 'bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-gray-100';
        el.innerHTML = `
            <div class="flex justify-between items-center">
                <h3 class="font-bold text-lg text-gray-800">${lesson.title}</h3>
                <span class="text-xs font-semibold bg-blue-100 text-blue-600 px-2 py-1 rounded">MATEMATYKA</span>
            </div>
            <p class="text-gray-500 text-sm mt-2">${lesson.description || 'Brak opisu'}</p>
        `;
        el.onclick = () => openLesson(lesson);
        list.appendChild(el);
    });
}

function openLesson(lesson) {
    showView('lesson');
    document.getElementById('lesson-title').innerText = lesson.title;
    document.getElementById('lesson-id').value = lesson.id; // Hidden input for upload

    // Reset state
    document.getElementById('quiz-result').innerHTML = '';
}

// --- Upload & Generate ---

async function uploadAndGenerate() {
    const fileInput = document.getElementById('audio-file');
    const lessonId = document.getElementById('lesson-id').value;
    const file = fileInput.files[0];

    if (!file) return alert("Wybierz plik!");

    const formData = new FormData();
    formData.append('file', file);

    const btn = document.getElementById('generate-btn');
    const loading = document.getElementById('loading-indicator');

    btn.disabled = true;
    loading.classList.remove('hidden');

    try {
        const token = currentSession.access_token;
        const url = `/quizzes/generate?lesson_id=${lessonId}`; // Fixed param name to match backend

        const res = await fetch(url, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await res.json();

        if (data.status === 'success') {
            renderQuiz(data.quiz);
        } else {
            alert('Błąd: ' + (data.detail || 'Nieznany błąd'));
        }

    } catch (e) {
        console.error(e);
        alert('Błąd połączenia');
    } finally {
        btn.disabled = false;
        loading.classList.add('hidden');
    }
}

function renderQuiz(questions) {
    const container = document.getElementById('quiz-result');
    container.innerHTML = '';

    questions.forEach((q, idx) => {
        const card = document.createElement('div');
        card.className = 'bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4';

        let answersHtml = '';
        q.odpowiedzi.forEach(ans => {
            answersHtml += `<button class="w-full text-left p-3 rounded bg-white border border-gray-200 mt-2 hover:bg-blue-50 transition" onclick="checkAns(this, '${q.poprawna}')">${ans}</button>`;
        });

        card.innerHTML = `
            <p class="font-semibold text-gray-800">${idx + 1}. ${q.pytanie}</p>
            <div class="mt-2 text-sm">${answersHtml}</div>
        `;
        container.appendChild(card);
    });
}

function checkAns(btn, correct) {
    const text = btn.innerText;
    // Assuming format is just text or "A. text"
    // The previous logic checked startsWith, let's keep it simple
    // Actually our Schema says 'poprawna' is e.g. "0" (index) or the text?
    // The prompt says: "odpowiedzi": ["1", "4"] and "poprawna": "0" (index string?) or value?
    // Let's check the prompt in ai.py.
    // "odpowiedzi": ["0", "1", "-1", "4"], "poprawna": "0". It seems 'poprawna' is the VALUE.

    if (text === correct || text.startsWith(correct)) {
        btn.classList.add('bg-green-100', 'border-green-300', 'text-green-700');
    } else {
        btn.classList.add('bg-red-100', 'border-red-300', 'text-red-700');
    }
}
