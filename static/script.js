// Session state
let accessToken = null;
let currentUserInfo = null;

// Quiz state
let quizState = {
    questions: [],
    quizId: null,
    lessonTitle: '',
    currentIndex: 0,
    answers: [],
    submitted: false,
};

// More-questions dialog state
let moreOpts = { count: 10, difficulty: 'same' };

// Flashcard state
let flashcardState = { cards: [], index: 0 };

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    dashboard: document.getElementById('dashboard-view'),
    lesson: document.getElementById('lesson-view'),
    admin: document.getElementById('admin-view'),
};

// ─── Auth ────────────────────────────────────────────────────

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
    document.getElementById('admin-nav-btn').classList.add('hidden');
}

function showLoggedIn() {
    showView('dashboard');
    document.getElementById('user-menu').classList.remove('hidden');
    document.getElementById('user-display-name').innerText = currentUserInfo.username || '';
    const adminBtn = document.getElementById('admin-nav-btn');
    if (currentUserInfo.role === 'admin') {
        adminBtn.classList.remove('hidden');
    } else {
        adminBtn.classList.add('hidden');
    }
    loadLessons();
}

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

// ─── Navigation ──────────────────────────────────────────────

function showView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    if (viewName === 'admin') loadUsers();
}

function authHeaders() {
    return { 'Authorization': `Bearer ${accessToken}` };
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function hideAllQuizSections() {
    ['upload-section', 'quiz-taking', 'quiz-results', 'quiz-review', 'quiz-flashcards'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
}

function showQuizSection(id) {
    hideAllQuizSections();
    document.getElementById(id).classList.remove('hidden');
}

// ─── Lessons ─────────────────────────────────────────────────

async function createTestLesson() {
    const title = prompt("Podaj tytuł nowej lekcji:");
    if (!title) return;
    try {
        const response = await fetch('/lessons/', {
            method: 'POST',
            body: JSON.stringify({ title, description: "Lekcja utworzona automatycznie" }),
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
        });
        if (response.ok) {
            alert("Dodano lekcję!");
            loadLessons();
        } else {
            const err = await response.json();
            alert("Błąd: " + (err.detail || JSON.stringify(err)));
        }
    } catch (e) { console.error(e); }
}

async function loadLessons() {
    try {
        const response = await fetch('/lessons/', { headers: authHeaders() });
        if (response.status === 401) { logout(); return; }
        if (!response.ok) throw new Error('Failed');
        renderLessonsList(await response.json());
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
                <h3 class="font-bold text-lg text-gray-800">${escapeHtml(lesson.title)}</h3>
                <span class="text-xs font-semibold bg-blue-100 text-blue-600 px-2 py-1 rounded">MATEMATYKA</span>
            </div>
            <p class="text-gray-500 text-sm mt-2">${escapeHtml(lesson.description || 'Brak opisu')}</p>
        `;
        el.onclick = () => openLesson(lesson);
        list.appendChild(el);
    });
}

async function openLesson(lesson) {
    showView('lesson');
    document.getElementById('lesson-title').innerText = lesson.title;
    document.getElementById('lesson-id').value = lesson.id;
    quizState.lessonTitle = lesson.title;

    hideAllQuizSections();

    try {
        const res = await fetch(`/quizzes/${lesson.id}`, { headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data) {
            const quiz = Array.isArray(data) ? data[0] : data;
            const questions = quiz?.questions_json;
            if (questions && questions.length > 0) {
                startQuiz(questions, quiz.id);
                return;
            }
        }
    } catch (e) {
        console.error('Błąd ładowania quizu:', e);
    }
    showQuizSection('upload-section');
}

// ─── Upload & Generate ───────────────────────────────────────

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
        const res = await fetch(`/quizzes/generate?lesson_id=${lessonId}`, {
            method: 'POST', body: formData, headers: authHeaders(),
        });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        if (data.status === 'success') {
            startQuiz(data.quiz, data.id);
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

// ─── Quiz Flow ───────────────────────────────────────────────

function startQuiz(questions, quizId) {
    quizState.questions = questions;
    quizState.quizId = quizId;
    quizState.currentIndex = 0;
    quizState.answers = new Array(questions.length).fill(null);
    quizState.submitted = false;
    showQuizSection('quiz-taking');
    document.getElementById('quiz-title-header').textContent = quizState.lessonTitle || 'Quiz';
    renderQuestion();
}

function renderQuestion() {
    const { questions, currentIndex, answers } = quizState;
    const q = questions[currentIndex];
    const total = questions.length;

    document.getElementById('quiz-counter').textContent = `${currentIndex + 1} / ${total}`;
    document.getElementById('quiz-progress-bar').style.width = `${((currentIndex + 1) / total) * 100}%`;

    const area = document.getElementById('quiz-question-area');
    const selected = answers[currentIndex];

    let html = `<p class="text-lg font-semibold text-gray-800 mb-5">${escapeHtml(q.pytanie)}</p><div class="space-y-2">`;
    q.odpowiedzi.forEach((ans, i) => {
        const isSelected = selected === ans;
        const base = 'w-full text-left p-4 rounded-xl border-2 text-sm font-medium transition';
        const style = isSelected
            ? `${base} border-blue-500 bg-blue-50 text-blue-800`
            : `${base} border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-gray-700`;
        html += `<button class="${style}" onclick="selectAnswer('${escapeHtml(ans)}')">${escapeHtml(ans)}</button>`;
    });
    html += '</div>';
    area.innerHTML = html;

    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnSubmit = document.getElementById('btn-submit');

    btnPrev.disabled = currentIndex === 0;
    if (currentIndex === total - 1) {
        btnNext.classList.add('hidden');
        btnSubmit.classList.remove('hidden');
    } else {
        btnNext.classList.remove('hidden');
        btnSubmit.classList.add('hidden');
    }
}

function selectAnswer(ans) {
    quizState.answers[quizState.currentIndex] = ans;
    renderQuestion();
}

function nextQuestion() {
    if (quizState.currentIndex < quizState.questions.length - 1) {
        quizState.currentIndex++;
        renderQuestion();
    }
}

function prevQuestion() {
    if (quizState.currentIndex > 0) {
        quizState.currentIndex--;
        renderQuestion();
    }
}

async function submitQuiz() {
    if (!confirm('Czy na pewno chcesz zakończyć test?')) return;
    quizState.submitted = true;

    try {
        const res = await fetch(`/quizzes/${quizState.quizId}/results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ answers: quizState.answers }),
        });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        renderResults(data.score, data.max_score);
    } catch (e) {
        console.error(e);
        const { questions, answers } = quizState;
        let score = 0;
        questions.forEach((q, i) => { if (answers[i] === q.poprawna) score++; });
        renderResults(score, questions.length);
    }
}

function renderResults(score, maxScore) {
    const { questions, answers } = quizState;
    let correct = 0, wrong = 0, skipped = 0;
    questions.forEach((q, i) => {
        if (answers[i] === null) skipped++;
        else if (answers[i] === q.poprawna) correct++;
        else wrong++;
    });
    const accuracy = maxScore > 0 ? Math.round((correct / maxScore) * 100) : 0;

    document.getElementById('result-score').textContent = `${score}/${maxScore}`;
    document.getElementById('result-accuracy').textContent = `${accuracy}%`;
    document.getElementById('result-correct').textContent = correct;
    document.getElementById('result-wrong').textContent = wrong;
    document.getElementById('result-skipped').textContent = skipped;

    document.getElementById('analysis-section').classList.add('hidden');
    document.getElementById('analysis-loading').classList.add('hidden');

    showQuizSection('quiz-results');
    loadAnalysis();
}

function showResultsScreen() {
    showQuizSection('quiz-results');
}

function restartQuiz() {
    startQuiz(quizState.questions, quizState.quizId);
}

// ─── Review ──────────────────────────────────────────────────

function showReview() {
    const { questions, answers } = quizState;
    const container = document.getElementById('review-list');
    container.innerHTML = '';

    questions.forEach((q, i) => {
        const userAns = answers[i];
        const isCorrect = userAns === q.poprawna;
        const isSkipped = userAns === null;

        let statusBadge, borderColor;
        if (isSkipped) { statusBadge = '<span class="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Pominięte</span>'; borderColor = 'border-gray-200'; }
        else if (isCorrect) { statusBadge = '<span class="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded">Poprawne</span>'; borderColor = 'border-green-200'; }
        else { statusBadge = '<span class="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded">Błędne</span>'; borderColor = 'border-red-200'; }

        let answersHtml = '';
        q.odpowiedzi.forEach(ans => {
            let cls = 'p-3 rounded-lg border text-sm';
            if (ans === q.poprawna) cls += ' bg-green-50 border-green-300 text-green-800 font-semibold';
            else if (ans === userAns && !isCorrect) cls += ' bg-red-50 border-red-300 text-red-800';
            else cls += ' bg-white border-gray-200 text-gray-600';
            answersHtml += `<div class="${cls}">${escapeHtml(ans)}</div>`;
        });

        const explanation = q.wyjasnienie ? `<div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">${escapeHtml(q.wyjasnienie)}</div>` : '';

        const card = document.createElement('div');
        card.className = `p-5 rounded-xl border-2 ${borderColor}`;
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <p class="font-semibold text-gray-800">${i + 1}. ${escapeHtml(q.pytanie)}</p>
                ${statusBadge}
            </div>
            <div class="space-y-2">${answersHtml}</div>
            ${explanation}
        `;
        container.appendChild(card);
    });

    showQuizSection('quiz-review');
}

// ─── More Questions ──────────────────────────────────────────

function showMoreQuestionsDialog() {
    moreOpts = { count: 10, difficulty: 'same' };
    updateMoreBtns();
    document.getElementById('more-questions-modal').classList.remove('hidden');
}

function closeMoreDialog() {
    document.getElementById('more-questions-modal').classList.add('hidden');
}

function selectMoreCount(n) {
    moreOpts.count = n;
    updateMoreBtns();
}

function selectMoreDiff(d) {
    moreOpts.difficulty = d;
    updateMoreBtns();
}

function updateMoreBtns() {
    document.querySelectorAll('#more-count-btns button').forEach(btn => {
        const active = parseInt(btn.dataset.count) === moreOpts.count;
        btn.className = `px-4 py-2 rounded-lg border text-sm font-medium transition ${active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50'}`;
    });
    document.querySelectorAll('#more-diff-btns button').forEach(btn => {
        const active = btn.dataset.diff === moreOpts.difficulty;
        btn.className = `px-4 py-2 rounded-lg border text-sm font-medium transition ${active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50'}`;
    });
}

async function requestMoreQuestions() {
    const btn = document.getElementById('btn-add-more');
    btn.disabled = true;
    btn.textContent = 'Generuję...';

    try {
        const res = await fetch(`/quizzes/${quizState.quizId}/more`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(moreOpts),
        });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        if (data.new_questions) {
            closeMoreDialog();
            startQuiz([...quizState.questions, ...data.new_questions], quizState.quizId);
        } else {
            alert(data.detail || 'Błąd generowania pytań');
        }
    } catch (e) {
        console.error(e);
        alert('Błąd połączenia');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Dodaj pytania';
    }
}

// ─── Flashcards ──────────────────────────────────────────────

async function loadFlashcards() {
    showQuizSection('quiz-flashcards');
    const loading = document.getElementById('flashcards-loading');
    const area = document.getElementById('flashcards-area');
    const nav = document.getElementById('flashcard-nav');
    loading.classList.remove('hidden');
    area.classList.add('hidden');
    nav.classList.add('hidden');

    try {
        const res = await fetch(`/quizzes/${quizState.quizId}/flashcards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
        });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        if (data.flashcards && data.flashcards.length > 0) {
            flashcardState.cards = data.flashcards;
            flashcardState.index = 0;
            loading.classList.add('hidden');
            area.classList.remove('hidden');
            nav.classList.remove('hidden');
            renderFlashcard();
        } else {
            loading.classList.add('hidden');
            area.classList.remove('hidden');
            document.getElementById('flashcard-card').innerHTML = '<p class="text-gray-500 text-center py-8">Nie udało się wygenerować fiszek.</p>';
        }
    } catch (e) {
        console.error(e);
        loading.classList.add('hidden');
        area.classList.remove('hidden');
        document.getElementById('flashcard-card').innerHTML = '<p class="text-red-500 text-center py-8">Błąd połączenia.</p>';
    }
}

function renderFlashcard() {
    const { cards, index } = flashcardState;
    const card = cards[index];
    document.getElementById('flashcard-counter').textContent = `${index + 1} / ${cards.length}`;
    document.getElementById('flashcard-card').innerHTML = `
        <div class="flip-card" onclick="this.classList.toggle('flipped')" style="min-height:180px">
            <div class="flip-card-inner">
                <div class="flip-card-front bg-blue-50 border-2 border-blue-200">
                    <div>
                        <p class="text-xs text-blue-500 uppercase font-semibold mb-2">Pojęcie</p>
                        <p class="text-lg font-bold text-blue-900">${escapeHtml(card.przod)}</p>
                    </div>
                </div>
                <div class="flip-card-back bg-green-50 border-2 border-green-200">
                    <div>
                        <p class="text-xs text-green-500 uppercase font-semibold mb-2">Odpowiedź</p>
                        <p class="text-sm text-green-900">${escapeHtml(card.tyl)}</p>
                    </div>
                </div>
            </div>
        </div>
        <p class="text-xs text-gray-400 text-center mt-2">Kliknij kartę, aby obrócić</p>
    `;
}

function nextFlashcard() {
    if (flashcardState.index < flashcardState.cards.length - 1) {
        flashcardState.index++;
        renderFlashcard();
    }
}

function prevFlashcard() {
    if (flashcardState.index > 0) {
        flashcardState.index--;
        renderFlashcard();
    }
}

// ─── AI Analysis ─────────────────────────────────────────────

async function loadAnalysis() {
    const section = document.getElementById('analysis-section');
    const loading = document.getElementById('analysis-loading');
    section.classList.add('hidden');
    loading.classList.remove('hidden');

    try {
        const res = await fetch(`/quizzes/${quizState.quizId}/analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ answers: quizState.answers }),
        });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        loading.classList.add('hidden');

        const content = document.getElementById('analysis-content');
        let html = '';
        if (data.mocne_strony) html += `<p><strong>Mocne strony:</strong> ${escapeHtml(data.mocne_strony)}</p>`;
        if (data.obszary_do_poprawy) html += `<p><strong>Do poprawy:</strong> ${escapeHtml(data.obszary_do_poprawy)}</p>`;
        if (data.wskazowki) html += `<p><strong>Wskazówki:</strong> ${escapeHtml(data.wskazowki)}</p>`;

        if (html) {
            content.innerHTML = html;
            section.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Analysis error:', e);
        loading.classList.add('hidden');
    }
}

// ─── Admin Panel ─────────────────────────────────────────────

function showAdminMessage(text, isError) {
    const msg = document.getElementById('admin-message');
    msg.innerText = text;
    msg.className = `text-sm ${isError ? 'text-red-600' : 'text-green-600'}`;
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 4000);
}

async function loadUsers() {
    const container = document.getElementById('users-list');
    container.innerHTML = '<div class="animate-pulse bg-gray-200 h-16 rounded-lg"></div>';
    try {
        const res = await fetch('/admin/users', { headers: authHeaders() });
        if (res.status === 401) { logout(); return; }
        if (res.status === 403) { container.innerHTML = '<p class="text-red-500">Brak uprawnień administratora.</p>'; return; }
        if (!res.ok) throw new Error('Fetch failed');
        renderUsersTable(await res.json());
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-red-500">Nie udało się pobrać listy użytkowników.</p>';
    }
}

function renderUsersTable(users) {
    const container = document.getElementById('users-list');
    if (!users || users.length === 0) { container.innerHTML = '<p class="text-gray-500">Brak użytkowników.</p>'; return; }

    const roleLabels = { student: 'Uczeń', parent: 'Rodzic', admin: 'Admin' };
    const roleBadge = (role) => {
        const colors = { admin: 'bg-purple-100 text-purple-700', parent: 'bg-yellow-100 text-yellow-700', student: 'bg-blue-100 text-blue-600' };
        return `<span class="text-xs font-semibold px-2 py-0.5 rounded ${colors[role] || colors.student}">${roleLabels[role] || role}</span>`;
    };

    let html = `<table class="w-full text-sm text-left">
        <thead class="text-xs text-gray-500 uppercase border-b"><tr>
            <th class="py-2 pr-4">Użytkownik</th><th class="py-2 pr-4">Imię i nazwisko</th>
            <th class="py-2 pr-4">Rola</th><th class="py-2 pr-4">Utworzony</th><th class="py-2"></th>
        </tr></thead><tbody>`;

    users.forEach(u => {
        const date = u.created_at ? new Date(u.created_at).toLocaleDateString('pl-PL') : '—';
        const isSelf = currentUserInfo && u.username === currentUserInfo.username;
        const isStudent = u.role === 'student';
        const rowClick = isStudent ? `onclick="loadStudentProgress('${u.id}', '${escapeHtml(u.full_name || u.username)}')" style="cursor:pointer"` : '';
        html += `<tr class="border-b last:border-0 hover:bg-gray-50" ${rowClick}>
            <td class="py-3 pr-4 font-medium text-gray-800">${escapeHtml(u.username)}${isStudent ? ' <span class="text-xs text-blue-500">▸ postępy</span>' : ''}</td>
            <td class="py-3 pr-4 text-gray-600">${escapeHtml(u.full_name || '—')}</td>
            <td class="py-3 pr-4">${roleBadge(u.role)}</td>
            <td class="py-3 pr-4 text-gray-500">${date}</td>
            <td class="py-3 text-right">${isSelf ? '' : `<button onclick="event.stopPropagation(); deleteUser('${escapeHtml(u.username)}')" class="text-xs text-red-500 hover:text-red-700 font-medium">Usuń</button>`}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

async function createUser() {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const fullName = document.getElementById('new-fullname').value.trim();
    const role = document.getElementById('new-role').value;
    const btn = document.getElementById('create-user-btn');

    if (!username || !password) { showAdminMessage('Podaj nazwę użytkownika i hasło.', true); return; }
    if (password.length < 6) { showAdminMessage('Hasło musi mieć minimum 6 znaków.', true); return; }

    btn.disabled = true;
    btn.innerText = 'Dodawanie...';
    try {
        const res = await fetch('/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ username, password, full_name: fullName || null, role }),
        });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        if (res.ok) {
            showAdminMessage(`Dodano użytkownika "${username}".`, false);
            document.getElementById('new-username').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('new-fullname').value = '';
            document.getElementById('new-role').value = 'student';
            loadUsers();
        } else {
            showAdminMessage(data.detail || 'Błąd tworzenia użytkownika.', true);
        }
    } catch (e) {
        console.error(e);
        showAdminMessage('Błąd połączenia z serwerem.', true);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Dodaj użytkownika';
    }
}

async function deleteUser(username) {
    if (!confirm(`Czy na pewno chcesz usunąć użytkownika "${username}"?`)) return;
    try {
        const res = await fetch(`/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE', headers: authHeaders() });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        if (res.ok) { showAdminMessage(`Usunięto użytkownika "${username}".`, false); loadUsers(); }
        else { showAdminMessage(data.detail || 'Błąd usuwania użytkownika.', true); }
    } catch (e) {
        console.error(e);
        showAdminMessage('Błąd połączenia z serwerem.', true);
    }
}

// ─── Student Progress ────────────────────────────────────────

let currentProgressStudentId = null;

async function loadStudentProgress(studentId, displayName) {
    currentProgressStudentId = studentId;
    const panel = document.getElementById('student-progress-panel');
    const content = document.getElementById('progress-content');
    document.getElementById('progress-student-name').textContent = displayName;
    panel.classList.remove('hidden');
    content.innerHTML = '<div class="animate-pulse bg-gray-200 h-24 rounded-lg"></div>';
    panel.scrollIntoView({ behavior: 'smooth' });

    try {
        const res = await fetch(`/admin/students/${studentId}/progress`, { headers: authHeaders() });
        if (res.status === 401) { logout(); return; }
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        renderStudentProgress(data);
    } catch (e) {
        console.error(e);
        content.innerHTML = '<p class="text-red-500">Nie udało się pobrać postępów ucznia.</p>';
    }
}

function renderStudentProgress(data) {
    const content = document.getElementById('progress-content');
    const lessons = data.lessons || [];

    if (lessons.length === 0) {
        content.innerHTML = '<p class="text-gray-500">Brak przypisanych lekcji.</p>';
        return;
    }

    let html = '<div class="space-y-6">';
    lessons.forEach((lesson, lessonIdx) => {
        const date = lesson.created_at ? new Date(lesson.created_at).toLocaleDateString('pl-PL') : '—';
        const quizzes = lesson.quizzes || [];

        let quizHtml = '';
        if (quizzes.length === 0) {
            quizHtml = '<p class="text-sm text-gray-400 italic py-2">Brak quizu dla tej lekcji</p>';
        } else {
            quizzes.forEach((qz, qzIdx) => {
                const results = qz.results || [];
                const questions = qz.questions || [];
                const attempts = results.length;
                const bestResult = results.length > 0
                    ? results.reduce((best, r) => r.score > best.score ? r : best, results[0])
                    : null;

                let summaryBadge;
                if (!bestResult) {
                    summaryBadge = '<span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Nie rozwiązany</span>';
                } else {
                    const pct = Math.round((bestResult.score / bestResult.max_score) * 100);
                    const color = pct >= 70 ? 'text-green-700 bg-green-100' : pct >= 40 ? 'text-yellow-700 bg-yellow-100' : 'text-red-700 bg-red-100';
                    summaryBadge = `<span class="text-xs font-semibold ${color} px-2 py-0.5 rounded">Najlepszy: ${bestResult.score}/${bestResult.max_score} (${pct}%)</span>`;
                }

                const quizDomId = `quiz-detail-${lessonIdx}-${qzIdx}`;

                quizHtml += `
                    <div class="border rounded-lg overflow-hidden mt-3">
                        <button onclick="toggleQuizDetail('${quizDomId}')" class="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition text-left">
                            <div class="flex items-center gap-3">
                                <span class="text-sm font-medium text-gray-700">Quiz: ${questions.length} pytań</span>
                                ${summaryBadge}
                                <span class="text-xs text-gray-400">${attempts} ${attempts === 1 ? 'podejście' : 'podejść'}</span>
                            </div>
                            <svg id="${quizDomId}-arrow" class="w-4 h-4 text-gray-400 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                        <div id="${quizDomId}" class="hidden">`;

                if (attempts > 0) {
                    quizHtml += `<div class="p-3 border-b bg-white">
                        <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Historia podejść</p>
                        <div class="flex flex-wrap gap-2">`;
                    results.forEach((r, rIdx) => {
                        const pct = Math.round((r.score / r.max_score) * 100);
                        const color = pct >= 70 ? 'border-green-300 bg-green-50 text-green-800' : pct >= 40 ? 'border-yellow-300 bg-yellow-50 text-yellow-800' : 'border-red-300 bg-red-50 text-red-800';
                        const attemptDate = r.completed_at ? new Date(r.completed_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                        const hasDetails = r.details_json && r.details_json.length > 0;
                        quizHtml += `<button onclick="${hasDetails ? `showAdminAttemptReview('${quizDomId}', ${lessonIdx}, ${qzIdx}, ${rIdx})` : ''}" class="px-3 py-1.5 rounded-lg border text-xs font-medium ${color} ${hasDetails ? 'hover:opacity-80 cursor-pointer' : 'opacity-60 cursor-default'} transition">
                            #${results.length - rIdx}: ${r.score}/${r.max_score} (${pct}%) <span class="text-[10px] opacity-70">${attemptDate}</span>
                        </button>`;
                    });
                    quizHtml += `</div></div>`;
                }

                quizHtml += `<div id="${quizDomId}-review" class="p-3 bg-white"></div>`;

                if (attempts > 0 && results[0].details_json && results[0].details_json.length > 0) {
                    quizHtml += `<script>document.addEventListener('DOMContentLoaded',()=>{}); setTimeout(()=>showAdminAttemptReview('${quizDomId}', ${lessonIdx}, ${qzIdx}, 0), 0);</script>`;
                }

                quizHtml += `</div></div>`;
            });
        }

        html += `
            <div class="border rounded-xl overflow-hidden">
                <div class="p-4 bg-white">
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex-1 min-w-0">
                            <h3 class="font-semibold text-gray-800">${escapeHtml(lesson.title)}</h3>
                            <p class="text-xs text-gray-500">${escapeHtml(lesson.description || 'Brak opisu')}</p>
                        </div>
                        <div class="flex items-center gap-2 ml-3 shrink-0">
                            <span class="text-xs text-gray-400">${date}</span>
                            <button onclick="editLesson('${lesson.id}', '${escapeHtml(lesson.title).replace(/'/g, "\\'")}', '${escapeHtml(lesson.description || '').replace(/'/g, "\\'")}')"
                                class="text-xs text-purple-600 hover:text-purple-800 font-medium">Edytuj</button>
                        </div>
                    </div>
                    ${quizHtml}
                </div>
            </div>`;
    });
    html += '</div>';
    content.innerHTML = html;

    _adminProgressData = data;
    lessons.forEach((lesson, li) => {
        (lesson.quizzes || []).forEach((qz, qi) => {
            const results = qz.results || [];
            if (results.length > 0 && results[0].details_json && results[0].details_json.length > 0) {
                showAdminAttemptReview(`quiz-detail-${li}-${qi}`, li, qi, 0);
            }
        });
    });
}

let _adminProgressData = null;

function toggleQuizDetail(domId) {
    const el = document.getElementById(domId);
    const arrow = document.getElementById(domId + '-arrow');
    if (!el) return;
    el.classList.toggle('hidden');
    if (arrow) arrow.classList.toggle('rotate-180');
}

function showAdminAttemptReview(quizDomId, lessonIdx, qzIdx, resultIdx) {
    if (!_adminProgressData) return;
    const lesson = _adminProgressData.lessons[lessonIdx];
    const qz = lesson.quizzes[qzIdx];
    const result = qz.results[resultIdx];
    const questions = qz.questions || [];
    const details = result.details_json || [];

    const container = document.getElementById(quizDomId + '-review');
    if (!container) return;

    let correct = 0, wrong = 0, skipped = 0;
    details.forEach(d => {
        if (!d.odpowiedz_ucznia) skipped++;
        else if (d.czy_poprawna) correct++;
        else wrong++;
    });
    const total = details.length || questions.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    let html = `
        <div class="mb-4 p-3 rounded-lg bg-gray-50 border">
            <div class="flex items-center justify-between mb-2">
                <p class="text-sm font-semibold text-gray-700">Podejście #${qz.results.length - resultIdx}</p>
                <p class="text-xs text-gray-400">${result.completed_at ? new Date(result.completed_at).toLocaleString('pl-PL') : ''}</p>
            </div>
            <div class="grid grid-cols-4 gap-2 text-center">
                <div><p class="text-lg font-bold text-gray-900">${result.score}/${result.max_score}</p><p class="text-[10px] text-gray-500 uppercase">Wynik</p></div>
                <div><p class="text-lg font-bold ${pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-yellow-600' : 'text-red-600'}">${pct}%</p><p class="text-[10px] text-gray-500 uppercase">Dokładność</p></div>
                <div><p class="text-lg font-bold text-green-600">${correct}</p><p class="text-[10px] text-gray-500 uppercase">Poprawne</p></div>
                <div><p class="text-lg font-bold text-red-600">${wrong}</p><p class="text-[10px] text-gray-500 uppercase">Błędne</p></div>
            </div>
        </div>
        <p class="text-xs font-semibold text-gray-500 uppercase mb-3">Przegląd pytań</p>
        <div class="space-y-3">`;

    questions.forEach((q, i) => {
        const detail = details[i];
        const userAns = detail ? detail.odpowiedz_ucznia : null;
        const isCorrect = detail ? detail.czy_poprawna : false;
        const isSkipped = !userAns;

        let borderColor, statusBadge;
        if (isSkipped) {
            borderColor = 'border-gray-200';
            statusBadge = '<span class="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">POMINIĘTE</span>';
        } else if (isCorrect) {
            borderColor = 'border-green-200';
            statusBadge = '<span class="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">POPRAWNE</span>';
        } else {
            borderColor = 'border-red-200';
            statusBadge = '<span class="text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">BŁĘDNE</span>';
        }

        let answersHtml = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">';
        (q.odpowiedzi || []).forEach(ans => {
            let cls = 'px-3 py-2 rounded-lg border text-xs';
            if (ans === q.poprawna) {
                cls += ' bg-green-50 border-green-300 text-green-800 font-semibold';
            } else if (ans === userAns && !isCorrect) {
                cls += ' bg-red-50 border-red-300 text-red-800 line-through';
            } else {
                cls += ' bg-white border-gray-200 text-gray-500';
            }
            answersHtml += `<div class="${cls}">${escapeHtml(ans)}</div>`;
        });
        answersHtml += '</div>';

        const explanation = q.wyjasnienie
            ? `<div class="mt-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">${escapeHtml(q.wyjasnienie)}</div>`
            : '';

        html += `
            <div class="p-3 rounded-lg border ${borderColor}">
                <div class="flex justify-between items-start gap-2 mb-1">
                    <p class="text-sm font-medium text-gray-800">${i + 1}. ${escapeHtml(q.pytanie)}</p>
                    ${statusBadge}
                </div>
                ${answersHtml}
                ${explanation}
            </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

function closeStudentProgress() {
    document.getElementById('student-progress-panel').classList.add('hidden');
    currentProgressStudentId = null;
}

// ─── Lesson Editing ──────────────────────────────────────────

function editLesson(lessonId, title, description) {
    document.getElementById('edit-lesson-id').value = lessonId;
    document.getElementById('edit-lesson-title').value = title;
    document.getElementById('edit-lesson-desc').value = description;
    document.getElementById('lesson-edit-modal').classList.remove('hidden');
}

function closeLessonEditModal() {
    document.getElementById('lesson-edit-modal').classList.add('hidden');
}

async function saveLesson() {
    const lessonId = document.getElementById('edit-lesson-id').value;
    const title = document.getElementById('edit-lesson-title').value.trim();
    const description = document.getElementById('edit-lesson-desc').value.trim();
    const btn = document.getElementById('btn-save-lesson');

    if (!title) { alert('Tytuł nie może być pusty.'); return; }

    btn.disabled = true;
    btn.textContent = 'Zapisuję...';
    try {
        const res = await fetch(`/admin/lessons/${lessonId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ title, description: description || null }),
        });
        if (res.status === 401) { logout(); return; }
        if (!res.ok) {
            const data = await res.json();
            alert(data.detail || 'Błąd zapisu.');
            return;
        }
        closeLessonEditModal();
        if (currentProgressStudentId) {
            const name = document.getElementById('progress-student-name').textContent;
            loadStudentProgress(currentProgressStudentId, name);
        }
    } catch (e) {
        console.error(e);
        alert('Błąd połączenia.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Zapisz';
    }
}
