import { useState, useEffect, useCallback } from 'react';
import { apiPost } from '../api/client';
import Spinner from './Spinner';
import MathContent from './MathContent';
import type { QuizQuestion, AnalysisResult } from '../types';

interface QuizResultsProps {
  questions: QuizQuestion[];
  answers: (string | null)[];
  quizId: string;
  score: number;
  maxScore: number;
  onReview: () => void;
  onRestart: () => void;
  onFlashcards: () => void;
  onMoreQuestions: () => void;
}

export default function QuizResults({
  questions,
  answers,
  quizId,
  score,
  maxScore,
  onReview,
  onRestart,
  onFlashcards,
  onMoreQuestions,
}: QuizResultsProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);

  let correct = 0,
    wrong = 0,
    skipped = 0;
  questions.forEach((q, i) => {
    if (answers[i] === null) skipped++;
    else if (answers[i] === q.poprawna) correct++;
    else wrong++;
  });
  const accuracy = maxScore > 0 ? Math.round((correct / maxScore) * 100) : 0;

  const loadAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    try {
      const data = await apiPost<AnalysisResult>(
        `/quizzes/${quizId}/analysis`,
        { answers },
      );
      setAnalysis(data);
    } catch {
      // silently fail
    } finally {
      setAnalysisLoading(false);
    }
  }, [quizId, answers]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <h2 className="text-2xl font-bold text-green-700 mb-6">
        Test ukończony!
      </h2>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-50 p-4 rounded-xl border">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            Wynik
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {score}/{maxScore}
          </p>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl border">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            Dokładność
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {accuracy}%
          </p>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl border">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-2">
            Szczegóły
          </p>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Poprawne</span>
              <span className="font-semibold text-green-600">{correct}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Błędne</span>
              <span className="font-semibold text-red-600">{wrong}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Pominięte</span>
              <span className="font-semibold text-gray-400">{skipped}</span>
            </div>
          </div>
        </div>
      </div>

      {analysisLoading && (
        <div className="mb-8">
          <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 flex items-center gap-3">
            <Spinner className="text-blue-600 h-5 w-5" />
            <span className="text-sm text-blue-700 font-medium">
              Analizuję Twoje wyniki...
            </span>
          </div>
        </div>
      )}

      {analysis &&
        (analysis.mocne_strony ||
          analysis.obszary_do_poprawy ||
          analysis.wskazowki) && (
          <div className="mb-8">
            <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
              <h3 className="font-semibold text-blue-900 mb-2">
                Mocne strony i obszary rozwoju
              </h3>
              <MathContent className="text-sm text-blue-800 space-y-2">
                {analysis.mocne_strony && (
                  <p>
                    <strong>Mocne strony:</strong> {analysis.mocne_strony}
                  </p>
                )}
                {analysis.obszary_do_poprawy && (
                  <p>
                    <strong>Do poprawy:</strong>{' '}
                    {analysis.obszary_do_poprawy}
                  </p>
                )}
                {analysis.wskazowki && (
                  <p>
                    <strong>Wskazówki:</strong> {analysis.wskazowki}
                  </p>
                )}
              </MathContent>
            </div>
          </div>
        )}

      <h3 className="font-semibold text-gray-800 mb-3">Ucz się dalej</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <button
          onClick={onFlashcards}
          className="text-left bg-gray-50 p-4 rounded-xl border hover:bg-gray-100 transition"
        >
          <p className="font-semibold text-gray-800">Fiszki</p>
          <p className="text-xs text-gray-500 mt-1">
            Utwórz zestaw fiszek z materiałów do szybkiego powtórzenia.
          </p>
        </button>
        <button
          onClick={onMoreQuestions}
          className="text-left bg-gray-50 p-4 rounded-xl border hover:bg-gray-100 transition"
        >
          <p className="font-semibold text-gray-800">Więcej pytań</p>
          <p className="text-xs text-gray-500 mt-1">
            Stwórz nowy quiz z dodatkowymi pytaniami z wybraną trudnością.
          </p>
        </button>
      </div>

      <div className="flex justify-center gap-4 pt-4 border-t">
        <button
          onClick={onReview}
          className="text-sm text-gray-600 hover:text-gray-900 font-medium"
        >
          Przejrzyj test
        </button>
        <button
          onClick={onRestart}
          className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          Rozwiąż ponownie
        </button>
      </div>
    </div>
  );
}
