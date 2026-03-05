import { useState, type FormEvent } from 'react';
import { apiPatch } from '../api/client';

interface LessonEditModalProps {
  lessonId: string;
  initialTitle: string;
  initialDescription: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function LessonEditModal({
  lessonId,
  initialTitle,
  initialDescription,
  onClose,
  onSaved,
}: LessonEditModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      alert('Tytuł nie może być pusty.');
      return;
    }
    setSaving(true);
    try {
      await apiPatch(`/admin/lessons/${lessonId}`, {
        title: title.trim(),
        description: description.trim() || null,
      });
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Błąd zapisu.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4"
      >
        <h3 className="text-lg font-bold text-gray-900 mb-4">Edytuj lekcję</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tytuł
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opis
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800 font-medium"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50"
          >
            {saving ? 'Zapisuję...' : 'Zapisz'}
          </button>
        </div>
      </form>
    </div>
  );
}
