import type { TaskCheckResult } from '../types';
import MathContent from './MathContent';

interface TaskResultPanelProps {
  result: TaskCheckResult;
}

function getResultStyle(result: TaskCheckResult) {
  const ans = result.poprawna_odpowiedz;
  const reas = result.poprawne_rozumowanie;

  if (ans && (reas === true || reas === null)) {
    return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', title: 'text-green-800' };
  }
  if (ans && reas === false) {
    return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', title: 'text-amber-800' };
  }
  return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', title: 'text-orange-800' };
}

function Badge({ correct, label }: { correct: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
        correct
          ? 'bg-green-100 text-green-800'
          : 'bg-red-100 text-red-800'
      }`}
    >
      {correct ? '✓' : '✗'} {label}
    </span>
  );
}

export default function TaskResultPanel({ result }: TaskResultPanelProps) {
  const s = getResultStyle(result);

  const ansCorrect = result.poprawna_odpowiedz;
  const reasoningKnown = result.poprawne_rozumowanie !== null;
  const reasoningCorrect = result.poprawne_rozumowanie === true;

  let title: string;
  if (ansCorrect && (!reasoningKnown || reasoningCorrect)) {
    title = 'Poprawna odpowiedź!';
  } else if (ansCorrect && !reasoningCorrect) {
    title = 'Odpowiedź poprawna, ale rozumowanie wymaga poprawy';
  } else {
    title = 'Niepoprawna odpowiedź';
  }

  return (
    <div className={`rounded-xl p-5 border ${s.bg} ${s.border}`}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className={`text-lg font-bold ${s.title}`}>{title}</h3>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Badge correct={ansCorrect} label="Odpowiedź" />
        {reasoningKnown && (
          <Badge correct={reasoningCorrect} label="Rozumowanie" />
        )}
      </div>

      <MathContent key={result.uzasadnienie.slice(0, 60)}>
        <div
          className={`text-sm whitespace-pre-line ${s.text}`}
          dangerouslySetInnerHTML={{
            __html: result.uzasadnienie.replace(
              /\*\*(.+?)\*\*/g,
              '<strong>$1</strong>',
            ),
          }}
        />
      </MathContent>
    </div>
  );
}
