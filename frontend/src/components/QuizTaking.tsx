import { useState } from 'react';
import { apiPost } from '../api/client';
import MathContent from './MathContent';
import type { QuizQuestion } from '../types';

interface QuizTakingProps {
  questions: QuizQuestion[];
  quizId: string;
  lessonTitle: string;
  onBack: () => void;
  onResults: (score: number, maxScore: number, answers: (string | null)[]) => void;
}

export default function QuizTaking({
  questions,
  quizId,
  lessonTitle,
  onBack,
  onResults,
}: QuizTakingProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>(
    () => new Array(questions.length).fill(null),
  );

  const total = questions.length;
  const q = questions[currentIndex];
  const selected = answers[currentIndex];

  function selectAnswer(ans: string) {
    const next = [...answers];
    next[currentIndex] = ans;
    setAnswers(next);
  }

  async function handleSubmit() {
    if (!confirm('Czy na pewno chcesz zakończyć test?')) return;
    try {
      const data = await apiPost<{ score: number; max_score: number }>(
        `/quizzes/${quizId}/results`,
        { answers },
      );
      onResults(data.score, data.max_score, answers);
    } catch {
      let score = 0;
      questions.forEach((qq, i) => {
        if (answers[i] === qq.poprawna) score++;
      });
      onResults(score, questions.length, answers);
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
      >
        ← Wróć do quizów
      </button>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="h-1.5 bg-gray-100">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{
              width: `${((currentIndex + 1) / total) * 100}%`,
            }}
          />
        </div>
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-900">
              {lessonTitle || 'Quiz'}
            </h2>
            <span className="text-sm font-medium text-gray-500">
              {currentIndex + 1} / {total}
            </span>
          </div>

          <MathContent>
            <p className="text-lg font-semibold text-gray-800 mb-5">
              {q.pytanie}
            </p>
            <div className="space-y-2">
              {q.odpowiedzi.map((ans, i) => {
                const isSelected = selected === ans;
                return (
                  <button
                    key={i}
                    onClick={() => selectAnswer(ans)}
                    className={`w-full text-left p-4 rounded-xl border-2 text-sm font-medium transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {ans}
                  </button>
                );
              })}
            </div>
          </MathContent>

          <div className="flex justify-between items-center mt-8 pt-4 border-t">
            <button
              onClick={() => setCurrentIndex(i => i - 1)}
              disabled={currentIndex === 0}
              className="text-sm text-gray-500 hover:text-gray-800 font-medium disabled:opacity-30"
            >
              ← Poprzednie
            </button>
            {currentIndex < total - 1 ? (
              <button
                onClick={() => setCurrentIndex(i => i + 1)}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition text-sm"
              >
                Następne →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition text-sm"
              >
                Zakończ test
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
