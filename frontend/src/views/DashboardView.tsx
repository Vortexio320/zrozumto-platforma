import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../api/client';
import type { Lesson } from '../types';

interface DashboardViewProps {
  onOpenLesson: (lesson: Lesson) => void;
}

export default function DashboardView({ onOpenLesson }: DashboardViewProps) {
  const { token } = useAuth();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLessons = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet<Lesson[]>('/lessons/');
      setLessons(data);
    } catch {
      setError('Nie udało się pobrać lekcji.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadLessons();
    } else {
      setLoading(false);
    }
  }, [token, loadLessons]);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Moje Lekcje</h1>
        <p className="text-gray-500">
          Wybierz lekcję, aby rozpocząć naukę.
        </p>
      </header>

      {loading && (
        <div className="animate-pulse bg-gray-200 h-24 rounded-lg" />
      )}

      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && lessons.length === 0 && (
        <p className="text-gray-500">Brak przypisanych lekcji.</p>
      )}

      <div className="grid gap-4">
        {lessons.map(lesson => (
          <div
            key={lesson.id}
            onClick={() => onOpenLesson(lesson)}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-gray-100"
          >
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-800">
                {lesson.title}
              </h3>
              <span className="text-xs font-semibold bg-blue-100 text-blue-600 px-2 py-1 rounded">
                MATEMATYKA
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-2">
              {lesson.description || 'Brak opisu'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
