import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiDelete } from '../api/client';
import MathContent from './MathContent';
import LessonEditModal from './LessonEditModal';
import type {
  StudentProgress,
  ProgressLesson,
  ProgressQuiz,
  QuizQuestion,
  QuizResult,
} from '../types';

interface StudentProgressPanelProps {
  studentId: string;
  displayName: string;
  onClose: () => void;
}

export default function StudentProgressPanel({
  studentId,
  displayName,
  onClose,
}: StudentProgressPanelProps) {
  const [data, setData] = useState<StudentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedQuizIds, setSelectedQuizIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedQuizzes, setExpandedQuizzes] = useState<Set<string>>(
    new Set(),
  );
  const [activeReviews, setActiveReviews] = useState<
    Record<string, { lessonIdx: number; qzIdx: number; resultIdx: number }>
  >({});
  const [editingLesson, setEditingLesson] = useState<{
    id: string;
    title: string;
    description: string;
  } | null>(null);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelectedQuizIds(new Set());
    try {
      const d = await apiGet<StudentProgress>(
        `/admin/students/${studentId}/progress`,
      );
      setData(d);
      // Auto-show first result for quizzes that have details
      const reviews: typeof activeReviews = {};
      d.lessons.forEach((lesson, li) => {
        lesson.quizzes.forEach((qz, qi) => {
          if (
            qz.results.length > 0 &&
            qz.results[0].details_json?.length > 0
          ) {
            reviews[`${li}-${qi}`] = {
              lessonIdx: li,
              qzIdx: qi,
              resultIdx: 0,
            };
          }
        });
      });
      setActiveReviews(reviews);
    } catch {
      setError('Nie udało się pobrać postępów ucznia.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  function toggleQuizDetail(key: string) {
    setExpandedQuizzes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleQuizSelection(quizId: string) {
    setSelectedQuizIds(prev => {
      const next = new Set(prev);
      if (next.has(quizId)) next.delete(quizId);
      else next.add(quizId);
      return next;
    });
  }

  async function deleteSelectedQuizzes() {
    const ids = Array.from(selectedQuizIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Czy na pewno chcesz usunąć ${ids.length} ${ids.length === 1 ? 'quiz' : 'quizów'}? Ta operacja jest nieodwracalna.`,
      )
    )
      return;

    let failed = 0;
    for (const id of ids) {
      try {
        await apiDelete(`/admin/quizzes/${id}`);
        setSelectedQuizIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch {
        failed++;
      }
    }
    if (failed > 0)
      alert(
        `Usunięto ${ids.length - failed} quizów. Nie udało się usunąć ${failed}.`,
      );
    loadProgress();
  }

  function showAttemptReview(
    lessonIdx: number,
    qzIdx: number,
    resultIdx: number,
  ) {
    setActiveReviews(prev => ({
      ...prev,
      [`${lessonIdx}-${qzIdx}`]: { lessonIdx, qzIdx, resultIdx },
    }));
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="animate-pulse bg-gray-200 h-24 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  const lessons = data?.lessons || [];

  return (
    <>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Postępy ucznia
            </h2>
            <p className="text-sm text-gray-500">{displayName}</p>
          </div>
          <div className="flex items-center gap-3">
            {selectedQuizIds.size > 0 && (
              <button
                onClick={deleteSelectedQuizzes}
                className="text-sm bg-red-100 hover:bg-red-200 text-red-700 py-1.5 px-3 rounded-lg font-medium transition"
              >
                Usuń wybrane ({selectedQuizIds.size})
              </button>
            )}
            <button
              onClick={onClose}
              className="text-sm text-gray-400 hover:text-gray-700 font-medium"
            >
              Zamknij &times;
            </button>
          </div>
        </div>

        {lessons.length === 0 ? (
          <p className="text-gray-500">Brak przypisanych lekcji.</p>
        ) : (
          <div className="space-y-6">
            {lessons.map((lesson, lessonIdx) => (
              <LessonProgressCard
                key={lesson.id}
                lesson={lesson}
                lessonIdx={lessonIdx}
                expandedQuizzes={expandedQuizzes}
                selectedQuizIds={selectedQuizIds}
                activeReviews={activeReviews}
                onToggleDetail={toggleQuizDetail}
                onToggleSelection={toggleQuizSelection}
                onShowReview={showAttemptReview}
                onEditLesson={() =>
                  setEditingLesson({
                    id: lesson.id,
                    title: lesson.title,
                    description: lesson.description || '',
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {editingLesson && (
        <LessonEditModal
          lessonId={editingLesson.id}
          initialTitle={editingLesson.title}
          initialDescription={editingLesson.description}
          onClose={() => setEditingLesson(null)}
          onSaved={() => {
            setEditingLesson(null);
            loadProgress();
          }}
        />
      )}
    </>
  );
}

// --- Sub-components ---

interface LessonProgressCardProps {
  lesson: ProgressLesson;
  lessonIdx: number;
  expandedQuizzes: Set<string>;
  selectedQuizIds: Set<string>;
  activeReviews: Record<
    string,
    { lessonIdx: number; qzIdx: number; resultIdx: number }
  >;
  onToggleDetail: (key: string) => void;
  onToggleSelection: (quizId: string) => void;
  onShowReview: (li: number, qi: number, ri: number) => void;
  onEditLesson: () => void;
}

function LessonProgressCard({
  lesson,
  lessonIdx,
  expandedQuizzes,
  selectedQuizIds,
  activeReviews,
  onToggleDetail,
  onToggleSelection,
  onShowReview,
  onEditLesson,
}: LessonProgressCardProps) {
  const date = lesson.lesson_date
    ? new Date(lesson.lesson_date).toLocaleDateString('pl-PL')
    : '—';
  const quizzes = lesson.quizzes || [];

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="p-4 bg-white">
        <div className="flex justify-between items-start mb-1">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-800">{lesson.title}</h3>
            <p className="text-xs text-gray-500">
              {lesson.description || 'Brak opisu'}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <span className="text-xs text-gray-400">{date}</span>
            <button
              onClick={onEditLesson}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium"
            >
              Edytuj
            </button>
          </div>
        </div>

        {quizzes.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-2">
            Brak quizu dla tej lekcji
          </p>
        ) : (
          quizzes.map((qz, qzIdx) => {
            const key = `${lessonIdx}-${qzIdx}`;
            return (
              <QuizProgressCard
                key={qz.id}
                quiz={qz}
                domKey={key}
                expanded={expandedQuizzes.has(key)}
                selected={selectedQuizIds.has(qz.id)}
                activeReview={activeReviews[key]}
                onToggleDetail={() => onToggleDetail(key)}
                onToggleSelection={() => onToggleSelection(qz.id)}
                onShowReview={(ri: number) =>
                  onShowReview(lessonIdx, qzIdx, ri)
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}

interface QuizProgressCardProps {
  quiz: ProgressQuiz;
  domKey: string;
  expanded: boolean;
  selected: boolean;
  activeReview?: { lessonIdx: number; qzIdx: number; resultIdx: number };
  onToggleDetail: () => void;
  onToggleSelection: () => void;
  onShowReview: (ri: number) => void;
}

function QuizProgressCard({
  quiz,
  expanded,
  selected,
  activeReview,
  onToggleDetail,
  onToggleSelection,
  onShowReview,
}: QuizProgressCardProps) {
  const results = quiz.results || [];
  const questions = quiz.questions || [];
  const attempts = results.length;
  const bestResult =
    results.length > 0
      ? results.reduce((best, r) => (r.score > best.score ? r : best), results[0])
      : null;

  let summaryBadge: { text: string; cls: string };
  if (!bestResult) {
    summaryBadge = {
      text: 'Nie rozwiązany',
      cls: 'text-gray-400 bg-gray-100',
    };
  } else {
    const pct = Math.round((bestResult.score / bestResult.max_score) * 100);
    const color =
      pct >= 70
        ? 'text-green-700 bg-green-100'
        : pct >= 40
          ? 'text-yellow-700 bg-yellow-100'
          : 'text-red-700 bg-red-100';
    summaryBadge = {
      text: `Najlepszy: ${bestResult.score}/${bestResult.max_score} (${pct}%)`,
      cls: `font-semibold ${color}`,
    };
  }

  return (
    <div className="border rounded-lg overflow-hidden mt-3">
      <div className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelection}
          onClick={e => e.stopPropagation()}
          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
        />
        <button
          onClick={onToggleDetail}
          className="flex-1 flex items-center justify-between text-left min-w-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-medium text-gray-700">
              Quiz: {questions.length} pytań
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${summaryBadge.cls}`}>
              {summaryBadge.text}
            </span>
            <span className="text-xs text-gray-400">
              {attempts} {attempts === 1 ? 'podejście' : 'podejść'}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transform transition-transform shrink-0 ml-2 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {expanded && (
        <div>
          {attempts > 0 && (
            <div className="p-3 border-b bg-white">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Historia podejść
              </p>
              <div className="flex flex-wrap gap-2">
                {results.map((r, rIdx) => {
                  const pct = Math.round(
                    (r.score / r.max_score) * 100,
                  );
                  const color =
                    pct >= 70
                      ? 'border-green-300 bg-green-50 text-green-800'
                      : pct >= 40
                        ? 'border-yellow-300 bg-yellow-50 text-yellow-800'
                        : 'border-red-300 bg-red-50 text-red-800';
                  const attemptDate = r.completed_at
                    ? new Date(r.completed_at).toLocaleString('pl-PL', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '';
                  const hasDetails =
                    r.details_json && r.details_json.length > 0;
                  return (
                    <button
                      key={rIdx}
                      onClick={() => hasDetails && onShowReview(rIdx)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${color} ${hasDetails ? 'hover:opacity-80 cursor-pointer' : 'opacity-60 cursor-default'} transition`}
                    >
                      #{results.length - rIdx}: {r.score}/{r.max_score} ({pct}
                      %){' '}
                      <span className="text-[10px] opacity-70">
                        {attemptDate}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeReview && (
            <AttemptReview
              questions={questions}
              result={results[activeReview.resultIdx]}
              attemptNumber={results.length - activeReview.resultIdx}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface AttemptReviewProps {
  questions: QuizQuestion[];
  result: QuizResult;
  attemptNumber: number;
}

function AttemptReview({ questions, result, attemptNumber }: AttemptReviewProps) {
  const details = result.details_json || [];
  let correct = 0,
    wrong = 0;
  details.forEach(d => {
    if (!d.odpowiedz_ucznia) return;
    if (d.czy_poprawna) correct++;
    else wrong++;
  });
  const total = details.length || questions.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="p-3 bg-white">
      <div className="mb-4 p-3 rounded-lg bg-gray-50 border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">
            Podejście #{attemptNumber}
          </p>
          <p className="text-xs text-gray-400">
            {result.completed_at
              ? new Date(result.completed_at).toLocaleString('pl-PL')
              : ''}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-gray-900">
              {result.score}/{result.max_score}
            </p>
            <p className="text-[10px] text-gray-500 uppercase">Wynik</p>
          </div>
          <div>
            <p
              className={`text-lg font-bold ${pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-yellow-600' : 'text-red-600'}`}
            >
              {pct}%
            </p>
            <p className="text-[10px] text-gray-500 uppercase">Dokładność</p>
          </div>
          <div>
            <p className="text-lg font-bold text-green-600">{correct}</p>
            <p className="text-[10px] text-gray-500 uppercase">Poprawne</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-600">{wrong}</p>
            <p className="text-[10px] text-gray-500 uppercase">Błędne</p>
          </div>
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
        Przegląd pytań
      </p>
      <MathContent className="space-y-3">
        {questions.map((q, i) => {
          const detail = details[i];
          const userAns = detail?.odpowiedz_ucznia ?? null;
          const isCorrect = detail?.czy_poprawna ?? false;
          const isSkipped = !userAns;

          let borderColor: string;
          let badge: { text: string; cls: string };
          if (isSkipped) {
            borderColor = 'border-gray-200';
            badge = {
              text: 'POMINIĘTE',
              cls: 'text-gray-400 bg-gray-100',
            };
          } else if (isCorrect) {
            borderColor = 'border-green-200';
            badge = {
              text: 'POPRAWNE',
              cls: 'text-green-700 bg-green-100',
            };
          } else {
            borderColor = 'border-red-200';
            badge = {
              text: 'BŁĘDNE',
              cls: 'text-red-700 bg-red-100',
            };
          }

          return (
            <div key={i} className={`p-3 rounded-lg border ${borderColor}`}>
              <div className="flex justify-between items-start gap-2 mb-1">
                <p className="text-sm font-medium text-gray-800">
                  {i + 1}. {q.pytanie}
                </p>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.cls}`}
                >
                  {badge.text}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
                {(q.odpowiedzi || []).map((ans, j) => {
                  let cls = 'px-3 py-2 rounded-lg border text-xs';
                  if (ans === q.poprawna) {
                    cls +=
                      ' bg-green-50 border-green-300 text-green-800 font-semibold';
                  } else if (ans === userAns && !isCorrect) {
                    cls +=
                      ' bg-red-50 border-red-300 text-red-800 line-through';
                  } else {
                    cls += ' bg-white border-gray-200 text-gray-500';
                  }
                  return (
                    <div key={j} className={cls}>
                      {ans}
                    </div>
                  );
                })}
              </div>
              {q.wyjasnienie && (
                <div className="mt-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
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
