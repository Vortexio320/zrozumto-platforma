// Session state
let accessToken = null;
let currentUserInfo = null;

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    dashboard: document.getElementById('dashboard-view'),
    lesson: document.getElementById('lesson-view'),
};

// --- Auth ---

async function loginWithUsername() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const msg = document.getElementById('auth-message');
    const btn = document.getElementById('login-btn');

    if (!username || !password) {
        msg.innerText = "Podaj nazwę użytkownika i hasło.";
        msg.classList.remove('hidden');
        return;
    }

    msg.classList.add('hidden');
    btn.disabled = true;
    btn.innerText = "Logowanie...";

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            msg.innerText = data.detail || "Błąd logowania";
            msg.classList.remove('hidden');
            return;
        }

        accessToken = data.access_token;
        currentUserInfo = data.user;
        sessionStorage.setItem('access_token', accessToken);
        sessionStorage.setItem('user_info', JSON.stringify(currentUserInfo));
        showLoggedIn();
    } catch (e) {
        console.error(e);
        msg.innerText = "Błąd połączenia z serwerem.";
        msg.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerText = "Zaloguj";
    }
}

function logout() {
    accessToken = null;
    currentUserInfo = null;
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('user_info');
    showView('login');
    document.getElementById('user-menu').classList.add('hidden');
}

function showLoggedIn() {
    showView('dashboard');
    document.getElementById('user-menu').classList.remove('hidden');
    document.getElementById('user-display-name').innerText = currentUserInfo.username || '';
    loadLessons();
}

// Restore session on page load
window.onload = () => {
    const savedToken = sessionStorage.getItem('access_token');
    const savedUser = sessionStorage.getItem('user_info');
    if (savedToken && savedUser) {
        accessToken = savedToken;
        currentUserInfo = JSON.parse(savedUser);
        showLoggedIn();
    } else {
        showView('login');
    }
};

// --- Navigation ---

function showView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
}

function authHeaders() {
    return { 'Authorization': `Bearer ${accessToken}` };
}

// --- Data & Logic ---

async function createTestLesson() {
    const title = prompt("Podaj tytuł nowej lekcji:");
    if (!title) return;

    try {
        const response = await fetch('/lessons/', {
            method: 'POST',
            body: JSON.stringify({ title: title, description: "Lekcja utworzona automatycznie" }),
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(),
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
    try {
        const response = await fetch('/lessons/', {
            headers: authHeaders(),
        });

        if (response.status === 401) {
            logout();
            return;
        }

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

async function openLesson(lesson) {
    showView('lesson');
    document.getElementById('lesson-title').innerText = lesson.title;
    document.getElementById('lesson-id').value = lesson.id;
    const quizEl = document.getElementById('quiz-result');
    quizEl.innerHTML = '<p class="text-gray-500">Ładowanie quizu...</p>';

    try {
        const res = await fetch(`/quizzes/${lesson.id}`, { headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data) {
            const quiz = Array.isArray(data) ? data[0] : data;
            const questions = quiz?.questions_json;
            if (questions && questions.length > 0) {
                renderQuiz(questions);
                return;
            }
        }
    } catch (e) {
        console.error('Błąd ładowania quizu:', e);
    }
    quizEl.innerHTML = '<p class="text-gray-500">Brak quizu dla tej lekcji.</p>';
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
        const url = `/quizzes/generate?lesson_id=${lessonId}`;

        const res = await fetch(url, {
            method: 'POST',
            body: formData,
            headers: authHeaders(),
        });

        if (res.status === 401) {
            logout();
            return;
        }

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
    if (text === correct || text.startsWith(correct)) {
        btn.classList.add('bg-green-100', 'border-green-300', 'text-green-700');
    } else {
        btn.classList.add('bg-red-100', 'border-red-300', 'text-red-700');
    }
}
