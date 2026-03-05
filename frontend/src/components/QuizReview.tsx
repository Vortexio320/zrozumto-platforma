import MathContent from './MathContent';
import type { QuizQuestion } from '../types';

interface QuizReviewProps {
  questions: QuizQuestion[];
  answers: (string | null)[];
  onBack: () => void;
}

export default function QuizReview({
  questions,
  answers,
  onBack,
}: QuizReviewProps) {
  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          Przegląd odpowiedzi
        </h2>
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-900 font-medium"
        >
          ← Wróć do wyników
        </button>
      </div>

      <MathContent className="space-y-4">
        {questions.map((q, i) => {
          const userAns = answers[i];
          const isCorrect = userAns === q.poprawna;
          const isSkipped = userAns === null;

          let borderColor: string;
          let statusBadge: { text: string; cls: string };
          if (isSkipped) {
            borderColor = 'border-gray-200';
            statusBadge = {
              text: 'Pominięte',
              cls: 'text-gray-400 bg-gray-100',
            };
          } else if (isCorrect) {
            borderColor = 'border-green-200';
            statusBadge = {
              text: 'Poprawne',
              cls: 'text-green-700 bg-green-100',
            };
          } else {
            borderColor = 'border-red-200';
            statusBadge = {
              text: 'Błędne',
              cls: 'text-red-700 bg-red-100',
            };
          }

          return (
            <div key={i} className={`p-5 rounded-xl border-2 ${borderColor}`}>
              <div className="flex justify-between items-start mb-3">
                <p className="font-semibold text-gray-800">
                  {i + 1}. {q.pytanie}
                </p>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${statusBadge.cls}`}
                >
                  {statusBadge.text}
                </span>
              </div>
              <div className="space-y-2">
                {q.odpowiedzi.map((ans, j) => {
                  let cls = 'p-3 rounded-lg border text-sm';
                  if (ans === q.poprawna) {
                    cls +=
                      ' bg-green-50 border-green-300 text-green-800 font-semibold';
                  } else if (ans === userAns && !isCorrect) {
                    cls += ' bg-red-50 border-red-300 text-red-800';
                  } else {
                    cls += ' bg-white border-gray-200 text-gray-600';
                  }
                  return (
                    <div key={j} className={cls}>
                      {ans}
                    </div>
                  );
                })}
              </div>
              {q.wyjasnienie && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  {q.wyjasnienie}
                </div>
              )}
            </div>
          );
        })}
      </MathContent>
    </div>
  );
}
