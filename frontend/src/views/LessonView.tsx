import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api/client';
import QuizListSection from '../components/QuizListSection';
import QuizTaking from '../components/QuizTaking';
import QuizResults from '../components/QuizResults';
import QuizReview from '../components/QuizReview';
import FlashcardsView from '../components/FlashcardsView';
import MoreQuestionsModal from '../components/MoreQuestionsModal';
import type { Lesson, Quiz, QuizQuestion } from '../types';

type SubView =
  | 'quiz-list'
  | 'quiz-taking'
  | 'results'
  | 'review'
  | 'flashcards';

interface LessonViewProps {
  lesson: Lesson;
  onBack: () => void;
}

export default function LessonView({ lesson, onBack }: LessonViewProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [subView, setSubView] = useState<SubView>('quiz-list');
  const [activeQuestions, setActiveQuestions] = useState<QuizQuestion[]>([]);
  const [activeQuizId, setActiveQuizId] = useState('');
  const [resultScore, setResultScore] = useState(0);
  const [resultMaxScore, setResultMaxScore] = useState(0);
  const [resultAnswers, setResultAnswers] = useState<(string | null)[]>([]);
  const [showMoreModal, setShowMoreModal] = useState(false);

  const loadQuizzes = useCallback(async () => {
    try {
      const data = await apiGet<Quiz[] | Quiz>(`/quizzes/${lesson.id}`);
      const arr = Array.isArray(data) ? data : data ? [data] : [];
      setQuizzes(arr);
      setSubView('quiz-list');
    } catch {
      setSubView('quiz-list');
    }
  }, [lesson.id]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  function startQuiz(questions: QuizQuestion[], quizId: string) {
    setActiveQuestions(questions);
    setActiveQuizId(quizId);
    setSubView('quiz-taking');
  }

  function handleResults(
    score: number,
    maxScore: number,
    answers: (string | null)[],
  ) {
    setResultScore(score);
    setResultMaxScore(maxScore);
    setResultAnswers(answers);
    setSubView('results');
  }

  function handleNewQuizFromMore(questions: QuizQuestion[], quizId: string) {
    setShowMoreModal(false);
    startQuiz(questions, quizId);
  }

  function handleBackToQuizList() {
    loadQuizzes();
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
      >
        ← Wróć do listy
      </button>

      {subView === 'quiz-list' && (
        <QuizListSection
          lessonTitle={lesson.title}
          quizzes={quizzes}
          onStartQuiz={startQuiz}
        />
      )}

      {subView === 'quiz-taking' && (
        <QuizTaking
          questions={activeQuestions}
          quizId={activeQuizId}
          lessonTitle={lesson.title}
          onBack={handleBackToQuizList}
          onResults={handleResults}
        />
      )}

      {subView === 'results' && (
        <QuizResults
          questions={activeQuestions}
          answers={resultAnswers}
          quizId={activeQuizId}
          score={resultScore}
          maxScore={resultMaxScore}
          onReview={() => setSubView('review')}
          onRestart={() => startQuiz(activeQuestions, activeQuizId)}
          onFlashcards={() => setSubView('flashcards')}
          onMoreQuestions={() => setShowMoreModal(true)}
        />
      )}

      {subView === 'review' && (
        <QuizReview
          questions={activeQuestions}
          answers={resultAnswers}
          onBack={() => setSubView('results')}
        />
      )}

      {subView === 'flashcards' && (
        <FlashcardsView
          quizId={activeQuizId}
          onBack={() => setSubView('results')}
        />
      )}

      {showMoreModal && (
        <MoreQuestionsModal
          quizId={activeQuizId}
          onClose={() => setShowMoreModal(false)}
          onNewQuiz={handleNewQuizFromMore}
        />
      )}
    </div>
  );
}
