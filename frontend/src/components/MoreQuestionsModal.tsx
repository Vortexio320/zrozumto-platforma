import { useState } from 'react';
import { apiPost } from '../api/client';
import type { QuizQuestion } from '../types';

interface MoreQuestionsModalProps {
  quizId: string;
  onClose: () => void;
  onNewQuiz: (questions: QuizQuestion[], quizId: string) => void;
}

const COUNTS = [5, 10, 20];
const DIFFICULTIES = [
  { value: 'easier', label: 'Łatwiejszy' },
  { value: 'same', label: 'Taki sam' },
  { value: 'harder', label: 'Trudniejszy' },
];

export default function MoreQuestionsModal({
  quizId,
  onClose,
  onNewQuiz,
}: MoreQuestionsModalProps) {
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState('same');
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const data = await apiPost<{
        quiz: QuizQuestion[];
        id: string;
        detail?: string;
      }>(`/quizzes/${quizId}/more`, { count, difficulty });
      if (data.quiz && data.id) {
        onNewQuiz(data.quiz, data.id);
      } else {
        alert(formatApiError(data.detail) || 'Błąd generowania pytań');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Błąd połączenia');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Generuj nowy quiz
        </h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Liczba pytań
          </label>
          <div className="flex gap-2">
            {COUNTS.map(n => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                  count === n
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'hover:bg-gray-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Trudność
          </label>
          <div className="flex gap-2">
            {DIFFICULTIES.map(d => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                  difficulty === d.value
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'hover:bg-gray-50'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800 font-medium"
          >
            Anuluj
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Generuję...' : 'Generuj nowy quiz'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatApiError(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail
      .map(
        (d: { msg?: string; loc?: string[] }) =>
          d.msg || d.loc?.join('.') || JSON.stringify(d),
      )
      .join('; ');
  return 'Błąd generowania pytań';
}
