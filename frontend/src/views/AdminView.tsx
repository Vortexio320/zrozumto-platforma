import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import { useAuth } from '../context/AuthContext';
import StudentProgressPanel from '../components/StudentProgressPanel';
import WhiteboardView from './WhiteboardView';
import type { AdminUser } from '../types';

interface AdminViewProps {
  onBack: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  student: 'Uczeń',
  parent: 'Rodzic',
  admin: 'Admin',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  parent: 'bg-yellow-100 text-yellow-700',
  student: 'bg-blue-100 text-blue-600',
};

const SCHOOL_TYPES = [
  { value: 'liceum', label: 'Liceum' },
  { value: 'podstawowka', label: 'Podstawówka' },
] as const;

const LICEUM_GRADES = ['1', '2', '3', '4'];
const PODSTAWOWKA_GRADES = ['4', '5', '6', '7', '8'];

function getClassOptions(schoolType: string | undefined): string[] {
  if (schoolType === 'liceum') return LICEUM_GRADES;
  if (schoolType === 'podstawowka') return PODSTAWOWKA_GRADES;
  return [];
}

export default function AdminView({ onBack }: AdminViewProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  // New user form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullname, setNewFullname] = useState('');
  const [newRole, setNewRole] = useState('student');
  const [newSchoolType, setNewSchoolType] = useState<'liceum' | 'podstawowka' | ''>('');
  const [newClass, setNewClass] = useState('');
  const [creating, setCreating] = useState(false);

  // Inline edit (updating student)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Student progress
  const [progressStudent, setProgressStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Whiteboard
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [whiteboardQuestion, setWhiteboardQuestion] = useState('Rozwiąż równanie: $2x + 3 = 7$');

  function showMessage(text: string, error: boolean) {
    setMessage({ text, error });
    setTimeout(() => setMessage(null), 4000);
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<AdminUser[]>('/admin/users');
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function createUser() {
    if (!newUsername.trim() || !newPassword) {
      showMessage('Podaj nazwę użytkownika i hasło.', true);
      return;
    }
    if (newPassword.length < 6) {
      showMessage('Hasło musi mieć minimum 6 znaków.', true);
      return;
    }
    setCreating(true);
    try {
      await apiPost('/admin/users', {
        username: newUsername.trim(),
        password: newPassword,
        full_name: newFullname.trim() || null,
        role: newRole,
        school_type: newSchoolType || undefined,
        class: newClass || undefined,
      });
      showMessage(`Dodano użytkownika "${newUsername.trim()}".`, false);
      setNewUsername('');
      setNewPassword('');
      setNewFullname('');
      setNewRole('student');
      setNewSchoolType('');
      setNewClass('');
      loadUsers();
    } catch (e) {
      showMessage(
        e instanceof Error ? e.message : 'Błąd tworzenia użytkownika.',
        true,
      );
    } finally {
      setCreating(false);
    }
  }

  async function updateStudent(
    userId: string,
    schoolType?: string,
    cls?: string | null,
  ) {
    setUpdatingUserId(userId);
    try {
      const body: { school_type?: string; class?: string | null } = {};
      if (schoolType !== undefined) body.school_type = schoolType || undefined;
      if (cls !== undefined) body.class = cls || undefined;
      await apiPatch(`/admin/users/${userId}`, body);
      showMessage('Zaktualizowano dane ucznia.', false);
      loadUsers();
    } catch (e) {
      showMessage(
        e instanceof Error ? e.message : 'Błąd aktualizacji.',
        true,
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function deleteUser(username: string) {
    if (
      !confirm(`Czy na pewno chcesz usunąć użytkownika "${username}"?`)
    )
      return;
    try {
      await apiDelete(`/admin/users/${encodeURIComponent(username)}`);
      showMessage(`Usunięto użytkownika "${username}".`, false);
      loadUsers();
    } catch (e) {
      showMessage(
        e instanceof Error ? e.message : 'Błąd usuwania użytkownika.',
        true,
      );
    }
  }

  if (showWhiteboard) {
    return (
      <WhiteboardView
        question={whiteboardQuestion}
        onBack={() => setShowWhiteboard(false)}
      />
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
      >
        ← Wróć do lekcji
      </button>

      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Panel Administracyjny
            </h1>
            <p className="text-gray-500">Zarządzaj użytkownikami platformy.</p>
          </div>
          <button
            onClick={() => setShowWhiteboard(true)}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center gap-2"
          >
            <span className="text-lg">🖊️</span> Tablica (test)
          </button>
        </div>
      </header>

      {/* Whiteboard question input */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Pytanie do tablicy (test)
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={whiteboardQuestion}
            onChange={e => setWhiteboardQuestion(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            placeholder="Wpisz pytanie otwarte..."
          />
          <button
            onClick={() => setShowWhiteboard(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition whitespace-nowrap"
          >
            Otwórz tablicę
          </button>
        </div>
      </div>

      {/* Create User */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Dodaj nowego ucznia
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nazwa użytkownika
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
              placeholder="jan.kowalski"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hasło
            </label>
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
              placeholder="min. 6 znaków"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Imię i nazwisko
            </label>
            <input
              type="text"
              value={newFullname}
              onChange={e => setNewFullname(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
              placeholder="Jan Kowalski"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rola
            </label>
            <select
              value={newRole}
              onChange={e => {
                setNewRole(e.target.value);
                if (e.target.value !== 'student') {
                  setNewSchoolType('');
                  setNewClass('');
                }
              }}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
            >
              <option value="student">Uczeń</option>
              <option value="parent">Rodzic</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {newRole === 'student' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Typ szkoły
                </label>
                <select
                  value={newSchoolType}
                  onChange={e => {
                    setNewSchoolType(e.target.value as 'liceum' | 'podstawowka' | '');
                    setNewClass('');
                  }}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                >
                  <option value="">— wybierz —</option>
                  {SCHOOL_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Klasa
                </label>
                <select
                  value={newClass}
                  onChange={e => setNewClass(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                  disabled={!newSchoolType}
                >
                  <option value="">— wybierz —</option>
                  {getClassOptions(newSchoolType || undefined).map(g => (
                    <option key={g} value={g}>{g}. klasa</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={createUser}
            disabled={creating}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-50"
          >
            {creating ? 'Dodawanie...' : 'Dodaj użytkownika'}
          </button>
          {message && (
            <p
              className={`text-sm ${message.error ? 'text-red-600' : 'text-green-600'}`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Lista użytkowników
        </h2>
        {loading ? (
          <div className="animate-pulse bg-gray-200 h-16 rounded-lg" />
        ) : users.length === 0 ? (
          <p className="text-gray-500">Brak użytkowników.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase border-b">
                <tr>
                  <th className="py-2 pr-4">Użytkownik</th>
                  <th className="py-2 pr-4">Imię i nazwisko</th>
                  <th className="py-2 pr-4">Rola</th>
                  <th className="py-2 pr-4">Typ szkoły</th>
                  <th className="py-2 pr-4">Klasa</th>
                  <th className="py-2 pr-4">Utworzony</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const date = u.created_at
                    ? new Date(u.created_at).toLocaleDateString('pl-PL')
                    : '—';
                  const isSelf =
                    currentUser && u.username === currentUser.username;
                  const isStudent = u.role === 'student';
                  return (
                    <tr
                      key={u.id}
                      className={`border-b last:border-0 hover:bg-gray-50 ${isStudent ? 'cursor-pointer' : ''}`}
                      onClick={() =>
                        isStudent &&
                        setProgressStudent({
                          id: u.id,
                          name: u.full_name || u.username,
                        })
                      }
                    >
                      <td className="py-3 pr-4 font-medium text-gray-800">
                        {u.username}
                        {isStudent && (
                          <span className="text-xs text-blue-500 ml-1">
                            ▸ postępy
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {u.full_name || '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${ROLE_COLORS[u.role] || ROLE_COLORS.student}`}
                        >
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4" onClick={e => isStudent && e.stopPropagation()}>
                        {isStudent ? (
                          <select
                            value={u.school_type || ''}
                            onChange={e => {
                              const val = e.target.value as 'liceum' | 'podstawowka' | '';
                              updateStudent(u.id, val || undefined, null);
                            }}
                            disabled={updatingUserId === u.id}
                            className="text-sm border rounded px-2 py-1 bg-white min-w-[110px]"
                          >
                            <option value="">—</option>
                            {SCHOOL_TYPES.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4" onClick={e => isStudent && e.stopPropagation()}>
                        {isStudent ? (
                          <select
                            value={u.class || ''}
                            onChange={e => updateStudent(u.id, u.school_type, e.target.value || undefined)}
                            disabled={updatingUserId === u.id || !u.school_type}
                            className="text-sm border rounded px-2 py-1 bg-white min-w-[90px]"
                          >
                            <option value="">—</option>
                            {getClassOptions(u.school_type).map(g => (
                              <option key={g} value={g}>{g}. klasa</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{date}</td>
                      <td className="py-3 text-right">
                        {!isSelf && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              deleteUser(u.username);
                            }}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Usuń
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student Progress */}
      {progressStudent && (
        <StudentProgressPanel
          studentId={progressStudent.id}
          displayName={progressStudent.name}
          onClose={() => setProgressStudent(null)}
        />
      )}
    </div>
  );
}
