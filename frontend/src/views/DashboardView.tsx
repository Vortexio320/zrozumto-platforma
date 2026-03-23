import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../api/client';
import type { Lesson } from '../types';

interface DashboardViewProps {
  onOpenLesson: (lesson: Lesson) => void;
  onOpenTasks?: () => void;
}

export default function DashboardView({ onOpenLesson, onOpenTasks }: DashboardViewProps) {
  const { user } = useAuth();
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
    if (user) {
      loadLessons();
    } else {
      setLoading(false);
    }
  }, [user, loadLessons]);

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

      {onOpenTasks && (
        <div
          onClick={onOpenTasks}
          className="mb-6 bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg text-indigo-900">
              Zadania egzaminacyjne
            </h3>
            <span className="text-xs font-semibold bg-indigo-100 text-indigo-600 px-2 py-1 rounded">
              EGZAMIN ÓSMOKLASISTY
            </span>
          </div>
          <p className="text-indigo-700 text-sm mt-2">
            Ćwicz zadania z egzaminu ósmoklasisty — przygotuj się do egzaminu z matematyki.
          </p>
          <p className="text-indigo-500 text-xs mt-1">
            Kliknij, aby wybrać polecane zadanie lub przeglądać według działów.
          </p>
        </div>
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
            {lesson.lesson_date && (
              <p className="text-gray-400 text-xs mt-1">
                Data lekcji: {new Date(lesson.lesson_date).toLocaleDateString('pl-PL')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
