import { useState, useEffect, useCallback } from 'react';
import { apiPost } from '../api/client';
import Spinner from './Spinner';
import MathContent from './MathContent';
import type { Flashcard } from '../types';

interface FlashcardsViewProps {
  quizId: string;
  onBack: () => void;
}

export default function FlashcardsView({ quizId, onBack }: FlashcardsViewProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiPost<{ flashcards: Flashcard[] }>(
        `/quizzes/${quizId}/flashcards`,
      );
      if (data.flashcards?.length > 0) {
        setCards(data.flashcards);
        setIndex(0);
      } else {
        setError('Nie udało się wygenerować fiszek.');
      }
    } catch {
      setError('Błąd połączenia.');
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    load();
  }, [load]);

  function goNext() {
    if (index < cards.length - 1) {
      setIndex(i => i + 1);
      setFlipped(false);
    }
  }

  function goPrev() {
    if (index > 0) {
      setIndex(i => i - 1);
      setFlipped(false);
    }
  }

  const card = cards[index];

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Fiszki</h2>
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-900 font-medium"
        >
          ← Wróć do wyników
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 justify-center py-12">
          <Spinner className="text-blue-600 h-5 w-5" />
          <span className="text-sm text-gray-500">Generuję fiszki...</span>
        </div>
      )}

      {error && (
        <p className="text-red-500 text-center py-8">{error}</p>
      )}

      {!loading && !error && card && (
        <div className="space-y-2">
          <span className="text-sm text-gray-500">
            {index + 1} / {cards.length}
          </span>

          <div
            className={`flip-card ${flipped ? 'flipped' : ''}`}
            onClick={() => setFlipped(f => !f)}
            style={{ minHeight: 180 }}
          >
            <div className="flip-card-inner">
              <MathContent className="flip-card-front bg-blue-50 border-2 border-blue-200">
                <div>
                  <p className="text-xs text-blue-500 uppercase font-semibold mb-2">
                    Pojęcie
                  </p>
                  <p className="text-lg font-bold text-blue-900">
                    {card.przod}
                  </p>
                </div>
              </MathContent>
              <MathContent className="flip-card-back bg-green-50 border-2 border-green-200">
                <div>
                  <p className="text-xs text-green-500 uppercase font-semibold mb-2">
                    Odpowiedź
                  </p>
                  <p className="text-sm text-green-900">{card.tyl}</p>
                </div>
              </MathContent>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center mt-2">
            Kliknij kartę, aby obrócić
          </p>

          <div className="flex justify-between items-center mt-4">
            <button
              onClick={goPrev}
              className="text-sm text-gray-500 hover:text-gray-800 font-medium"
            >
              ← Poprzednia
            </button>
            <button
              onClick={goNext}
              className="text-sm text-gray-500 hover:text-gray-800 font-medium"
            >
              Następna →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
