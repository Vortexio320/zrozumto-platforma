import { useState, useRef } from 'react';
import type { Zadanie, TaskCheckResult } from '../types';
import { apiPost } from '../api/client';
import MathContent from './MathContent';
import TikzRenderer from './TikzRenderer';
import ScratchCanvas, { type ScratchCanvasHandle } from './ScratchCanvas';
import TaskResultPanel from './TaskResultPanel';

interface TaskRendererProps {
  task: Zadanie;
  onNext: () => void;
}

const CONFIDENCE_OPTIONS = [
  { value: 1, label: 'Zgaduję', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 2, label: 'Nie jestem pewien/a', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 3, label: 'Jestem pewien/a', color: 'bg-green-100 text-green-800 border-green-300' },
];

export default function TaskRenderer({ task, onNext }: TaskRendererProps) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TaskCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scratchRef = useRef<ScratchCanvasHandle>(null);

  const [hints, setHints] = useState<string[]>([]);
  const [pendingHint2, setPendingHint2] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [workedExample, setWorkedExample] = useState<string | null>(null);
  const [workedExampleLoading, setWorkedExampleLoading] = useState(false);

  const isOpen = task.typ === 'otwarte';
  const canSubmit = !submitting && !result && confidence !== null && (isOpen || answer !== null);

  async function handleRequestHint() {
    if (hints.length >= 2 || hintLoading) return;
    if (hints.length === 1 && pendingHint2) {
      setHints(prev => [...prev, pendingHint2]);
      setPendingHint2(null);
      return;
    }
    setHintLoading(true);
    try {
      const data = await apiPost<{ hint: string; hint_2?: string }>('/tasks/hint', {
        zadanie_id: task.id,
        hint_level: 1,
      });
      setHints(prev => [...prev, data.hint]);
      if (data.hint_2) setPendingHint2(data.hint_2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać podpowiedzi.');
    } finally {
      setHintLoading(false);
    }
  }

  async function handleWorkedExample() {
    if (workedExampleLoading || workedExample) return;
    setWorkedExampleLoading(true);
    try {
      const data = await apiPost<{ steps: string }>('/tasks/worked-example', {
        zadanie_id: task.id,
      });
      setWorkedExample(data.steps);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać rozwiązania.');
    } finally {
      setWorkedExampleLoading(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      let imageBase64: string | null = null;
      if (scratchRef.current) {
        imageBase64 = await scratchRef.current.exportImageIfDrawn();
      }

      if (isOpen && !imageBase64) {
        setError('Narysuj rozwiązanie na tablicy.');
        setSubmitting(false);
        return;
      }

      const body: Record<string, unknown> = {
        zadanie_id: task.id,
        confidence,
        hints_used: hints.length,
      };
      if (answer) body.answer = answer;
      if (imageBase64) body.image_base64 = imageBase64;

      const data = await apiPost<TaskCheckResult>('/tasks/check', body);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wystąpił błąd.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Task header */}
      <div className="flex items-center gap-2 mb-1 text-xs text-gray-400">
        <span>Zadanie {task.numer}</span>
        <span>·</span>
        <span>{task.data}</span>
        <span>·</span>
        <span>{task.punkty} pkt</span>
        <span>·</span>
        <span className="capitalize">{task.podtyp}</span>
      </div>

      {/* Task text */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <MathContent>
          <p className="text-gray-900 leading-relaxed whitespace-pre-line">{task.tresc}</p>
        </MathContent>
      </div>

      {/* TikZ diagram */}
      {task.tikz ? (
        <TikzRenderer code={task.tikz} />
      ) : (
        (task.tresc?.toLowerCase().includes('rysunek') ||
          task.tresc?.toLowerCase().includes('zobacz rysunek')) && (
          <div className="my-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">
              Rysunek niedostępny — brak danych graficznych do tego zadania.
            </p>
          </div>
        )
      )}

      {/* Embedded scratch canvas: mandatory for open tasks, optional for closed */}
      <div className="no-select">
      <ScratchCanvas
            ref={scratchRef}
            collapsible={!isOpen}
          />
          </div>

      {/* Hint panel */}
      {hints.length > 0 && (
        <div className="mb-4 space-y-2">
          {hints.map((hint, i) => (
            <div
              key={i}
              className="bg-purple-50 border border-purple-200 rounded-xl p-4"
            >
              <p className="text-xs font-semibold text-purple-600 mb-1">
                Podpowiedź {i + 1}
              </p>
              <MathContent>
                <p className="text-sm text-purple-800 whitespace-pre-line">{hint}</p>
              </MathContent>
            </div>
          ))}
        </div>
      )}

      {/* Answer input based on podtyp */}
      {!result && (
        <>
          {isOpen ? null : (
            <div className="mt-4">
              <ClosedTaskInput
                task={task}
                answer={answer}
                onAnswer={setAnswer}
              />
            </div>
          )}


          {/* Hint + Confidence row */}
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-gray-600 mb-2">
                Jak bardzo jesteś pewien/a swojej odpowiedzi?
              </p>
              <div className="flex gap-2">
                {CONFIDENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setConfidence(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                      confidence === opt.value
                        ? opt.color
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleRequestHint}
              disabled={hints.length >= 2 || hintLoading || !!result}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {hintLoading
                ? 'Ładuję...'
                : hints.length >= 2
                  ? 'Wykorzystano podpowiedzi'
                  : `Podpowiedź (${hints.length}/2)`}
            </button>
          </div>

          {/* Submit */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sprawdzam...' : 'Sprawdź'}
            </button>
            {submitting && (
              <span className="text-sm text-gray-500">AI analizuje odpowiedź...</span>
            )}
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-4 space-y-4">
          <TaskResultPanel result={result} />

          {/* Worked example button — shown after wrong answer */}
          {!result.poprawna_odpowiedz && !workedExample && (
            <button
              onClick={handleWorkedExample}
              disabled={workedExampleLoading}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold border transition bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 disabled:opacity-50"
            >
              {workedExampleLoading
                ? 'Generuję rozwiązanie...'
                : 'Zobacz rozwiązanie krok po kroku'}
            </button>
          )}

          {/* Worked example display */}
          {workedExample && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h4 className="text-sm font-bold text-amber-800 mb-3">
                Rozwiązanie krok po kroku
              </h4>
              <MathContent>
                <div className="text-sm text-amber-900 whitespace-pre-line leading-relaxed">
                  {workedExample}
                </div>
              </MathContent>
            </div>
          )}

          <button
            onClick={onNext}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-indigo-700 transition"
          >
            Następne zadanie
          </button>
        </div>
      )}
    </div>
  );
}


/* ─── Sub-renderers for closed tasks ─── */

interface ClosedTaskInputProps {
  task: Zadanie;
  answer: string | null;
  onAnswer: (a: string) => void;
}

function ClosedTaskInput({ task, answer, onAnswer }: ClosedTaskInputProps) {
  switch (task.podtyp) {
    case 'wielokrotny wybor':
      return <WielokrotnyWybor task={task} answer={answer} onAnswer={onAnswer} />;
    case 'prawda/falsz':
      return <PrawdaFalsz task={task} answer={answer} onAnswer={onAnswer} />;
    case 'dobieranie':
      return <Dobieranie task={task} answer={answer} onAnswer={onAnswer} />;
    case 'wybor uzasadnienia':
      return <WyborUzasadnienia task={task} answer={answer} onAnswer={onAnswer} />;
    default:
      return <WielokrotnyWybor task={task} answer={answer} onAnswer={onAnswer} />;
  }
}


/* ── wielokrotny wybor ── */

function WielokrotnyWybor({ task, answer, onAnswer }: ClosedTaskInputProps) {
  return (
    <div className="space-y-2">
      {task.odpowiedzi.map((opt, i) => {
        const letter = opt.match(/^([A-D])\./)?.[1] ?? String.fromCharCode(65 + i);
        return (
          <button
            key={i}
            onClick={() => onAnswer(letter)}
            className={`w-full text-left px-4 py-3 rounded-xl border transition flex items-start gap-3 ${
              answer === letter
                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <span
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                answer === letter
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {letter}
            </span>
            <MathContent className="pt-1 min-w-0 flex-1 overflow-x-auto">
              <span>{opt.replace(/^[A-D]\.\s*/, '')}</span>
            </MathContent>
          </button>
        );
      })}
    </div>
  );
}


/* ── prawda/falsz ── */

function PrawdaFalsz({ task, answer, onAnswer }: ClosedTaskInputProps) {
  const statements = task.odpowiedzi.map(o =>
    o.replace(/\s*-\s*P\/F\s*$/, '').trim(),
  );

  const parsed: ('P' | 'F' | null)[] = answer
    ? answer.split(', ').map(v => (v === 'P' || v === 'F' ? v : null))
    : statements.map(() => null);

  function toggle(idx: number, val: 'P' | 'F') {
    const next = [...parsed];
    next[idx] = val;
    onAnswer(next.map(v => v ?? '').join(', '));
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {statements.map((stmt, i) => (
        <div
          key={i}
          className={`flex items-center gap-4 px-4 py-3 ${
            i > 0 ? 'border-t border-gray-100' : ''
          }`}
        >
          <MathContent className="flex-1 text-sm text-gray-800">
            <span>{stmt}</span>
          </MathContent>
          <div className="flex gap-1 flex-shrink-0">
            {(['P', 'F'] as const).map(val => (
              <button
                key={val}
                onClick={() => toggle(i, val)}
                className={`w-10 h-10 rounded-lg text-sm font-bold transition ${
                  parsed[i] === val
                    ? val === 'P'
                      ? 'bg-green-600 text-white'
                      : 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


/* ── dobieranie ── */

function Dobieranie({ task, answer, onAnswer }: ClosedTaskInputProps) {
  const groups = splitOptionGroups(task.odpowiedzi);
  const selections = answer ? answer.split(', ') : groups.map(() => '');

  function select(groupIdx: number, letter: string) {
    const next = [...selections];
    while (next.length < groups.length) next.push('');
    next[groupIdx] = letter;
    onAnswer(next.join(', '));
  }

  return (
    <div className="space-y-4">
      {groups.map((group, gi) => (
        <div key={gi}>
          <p className="text-xs text-gray-500 mb-1 font-medium">
            Grupa {gi + 1}
          </p>
          <div className="flex gap-2">
            {group.map(opt => {
              const letter = opt.match(/^([A-Z])\./)?.[1] ?? opt[0];
              return (
                <button
                  key={opt}
                  onClick={() => select(gi, letter)}
                  className={`px-4 py-2.5 rounded-xl border transition text-sm font-medium ${
                    selections[gi] === letter
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <MathContent>
                    <span>{opt}</span>
                  </MathContent>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function splitOptionGroups(odpowiedzi: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let lastCharCode = -1;

  for (const opt of odpowiedzi) {
    const match = opt.match(/^([A-Z])\./);
    if (!match) {
      current.push(opt);
      continue;
    }
    const code = match[1].charCodeAt(0);
    if (lastCharCode >= 0 && code <= lastCharCode) {
      groups.push(current);
      current = [];
    }
    current.push(opt);
    lastCharCode = code;
  }
  if (current.length) groups.push(current);

  // If only one group, split evenly
  if (groups.length === 1 && groups[0].length >= 4) {
    const half = Math.ceil(groups[0].length / 2);
    return [groups[0].slice(0, half), groups[0].slice(half)];
  }

  return groups;
}


/* ── wybor uzasadnienia ── */

/** Splits odpowiedzi into answer options, connector (between ponieważ and first numbered), and justification options. */
function parseWyborUzasadnienia(odpowiedzi: string[]): {
  answerOpts: string[];
  connector: string;
  justOpts: string[];
} {
  const ponIdx = odpowiedzi.findIndex((o) => /^ponieważ/i.test(o.trim()));
  const numIdx = odpowiedzi.findIndex((o) => /^\d+\./.test(o));

  if (ponIdx < 0 || numIdx < 0 || numIdx <= ponIdx) {
    // Fallback: old behavior – filter out bare "ponieważ", rest as answer/just
    const answerOpts: string[] = [];
    const justOpts: string[] = [];
    for (const opt of odpowiedzi) {
      if (/^\d+\./.test(opt)) justOpts.push(opt);
      else if (!/^ponieważ\s*$/i.test(opt.trim())) answerOpts.push(opt);
    }
    return { answerOpts, connector: 'ponieważ', justOpts };
  }

  const answerOpts = odpowiedzi.slice(0, ponIdx);
  const connectorParts = odpowiedzi.slice(ponIdx, numIdx);
  const connector = connectorParts.join(' ').trim() || 'ponieważ';
  const justOpts = odpowiedzi.slice(numIdx);

  return { answerOpts, connector, justOpts };
}

function WyborUzasadnienia({ task, answer, onAnswer }: ClosedTaskInputProps) {
  const { answerOpts, connector, justOpts } = parseWyborUzasadnienia(task.odpowiedzi);

  const selectedAns = answer?.match(/^([A-Z])/)?.[1] ?? null;
  const selectedJust = answer?.match(/(\d+)$/)?.[1] ?? null;

  function update(ans: string | null, just: string | null) {
    if (ans && just) {
      onAnswer(`${ans}${just}`);
    } else if (ans) {
      onAnswer(ans);
    } else if (just) {
      onAnswer(just);
    }
  }

  const optionClass =
    'w-full text-left px-4 py-3 min-h-[52px] flex items-center rounded-xl border transition text-sm';

  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-3">
      {/* Answer options - fixed min so connector shrinks first */}
      <div className="flex-1 flex flex-col gap-2 min-h-0 shrink-0 min-w-[7rem]">
        <p className="text-xs text-gray-500 font-medium mb-1 flex-shrink-0">Odpowiedź</p>
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {answerOpts.map((opt, i) => {
            const letter = opt.match(/^([A-Z])\./)?.[1] ?? String.fromCharCode(65 + i);
            return (
              <button
                key={i}
                onClick={() => update(letter, selectedJust)}
                className={`flex-1 min-h-0 ${optionClass} ${
                  selectedAns === letter
                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <MathContent className="flex-1 min-w-0">
                  <span>{opt}</span>
                </MathContent>
              </button>
            );
          })}
        </div>
      </div>

      {/* Connector: max width on desktop only; shrinks first when squeezed */}
      <div className="shrink flex items-center justify-center px-2 min-w-0 md:max-w-[10rem]">
        <MathContent className="w-full min-w-0 max-w-full">
          <span className="text-sm font-medium text-gray-400 italic break-words text-center block">{connector}</span>
        </MathContent>
      </div>

      {/* Justification options */}
      <div className="flex-1 flex flex-col gap-2 min-h-0 shrink-0 min-w-[15rem]">
        <p className="text-xs text-gray-500 font-medium mb-1 flex-shrink-0">Uzasadnienie</p>
        {justOpts.map((opt, i) => {
          const num = opt.match(/^(\d+)\./)?.[1] ?? String(i + 1);
          return (
            <button
              key={i}
              onClick={() => update(selectedAns, num)}
              className={`${optionClass} ${
                selectedJust === num
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <MathContent className="flex-1 min-w-0">
                <span>{opt}</span>
              </MathContent>
            </button>
          );
        })}
      </div>
    </div>
  );
}


