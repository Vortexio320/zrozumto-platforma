import type { Quiz, QuizQuestion } from '../types';

function pluralPytan(count: number): string {
  if (count === 1) return 'pytanie';
  if (count < 5) return 'pytania';
  return 'pytań';
}

interface QuizListSectionProps {
  lessonTitle: string;
  quizzes: Quiz[];
  onStartQuiz: (questions: QuizQuestion[], quizId: string) => void;
}

export default function QuizListSection({
  lessonTitle,
  quizzes,
  onStartQuiz,
}: QuizListSectionProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold mb-2">{lessonTitle}</h1>
      <p className="text-gray-500 mb-6">
        {quizzes.length > 0
          ? 'Wybierz quiz do rozwiązania.'
          : 'Brak quizu dla tej lekcji.'}
      </p>
      <div className="grid gap-4">
        {quizzes.map((quiz, idx) => {
          const questions = quiz.questions_json || [];
          const count = questions.length;
          return (
            <div
              key={quiz.id}
              onClick={() => onStartQuiz(questions, quiz.id)}
              className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-gray-100"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-800">
                  Quiz {idx + 1}
                </h3>
                <span className="text-sm text-gray-500">
                  {count} {pluralPytan(count)}
                </span>
              </div>
              <p className="text-gray-500 text-sm mt-2">
                Rozwiąż quiz z {count}{' '}
                {count === 1 ? 'pytaniem' : 'pytaniami'}.
              </p>
              <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
                Rozwiąż quiz
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
