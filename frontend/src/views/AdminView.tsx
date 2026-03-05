import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../api/client';
import { useAuth } from '../context/AuthContext';
import StudentProgressPanel from '../components/StudentProgressPanel';
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
  const [creating, setCreating] = useState(false);

  // Student progress
  const [progressStudent, setProgressStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
      });
      showMessage(`Dodano użytkownika "${newUsername.trim()}".`, false);
      setNewUsername('');
      setNewPassword('');
      setNewFullname('');
      setNewRole('student');
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

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
      >
        ← Wróć do lekcji
      </button>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Panel Administracyjny
        </h1>
        <p className="text-gray-500">Zarządzaj użytkownikami platformy.</p>
      </header>

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
              onChange={e => setNewRole(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
            >
              <option value="student">Uczeń</option>
              <option value="parent">Rodzic</option>
              <option value="admin">Admin</option>
            </select>
          </div>
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
