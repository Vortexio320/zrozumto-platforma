import { useRef, useState } from 'react';
import { ReactSketchCanvas, type ReactSketchCanvasRef } from 'react-sketch-canvas';
import { apiPost } from '../api/client';
import MathContent from '../components/MathContent';

interface AnalysisResult {
  poprawna: boolean;
  uzasadnienie: string;
}

interface WhiteboardViewProps {
  question: string;
  onBack: () => void;
}

type Tool = 'pen' | 'eraser';

const STROKE_COLORS = [
  { value: '#000000', label: 'Czarny' },
  { value: '#1d4ed8', label: 'Niebieski' },
  { value: '#dc2626', label: 'Czerwony' },
  { value: '#16a34a', label: 'Zielony' },
];

const STROKE_WIDTHS = [2, 4, 6, 10];

export default function WhiteboardView({ question, onBack }: WhiteboardViewProps) {
  const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectTool(t: Tool) {
    setTool(t);
    if (t === 'eraser') {
      canvasRef.current?.eraseMode(true);
    } else {
      canvasRef.current?.eraseMode(false);
    }
  }

  function handleClear() {
    canvasRef.current?.clearCanvas();
    setResult(null);
    setError(null);
  }

  function handleUndo() {
    canvasRef.current?.undo();
  }

  function handleRedo() {
    canvasRef.current?.redo();
  }

  async function handleSubmit() {
    if (!canvasRef.current) return;
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const dataUrl = await canvasRef.current.exportImage('png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

      const data = await apiPost<AnalysisResult>('/admin/whiteboard/analyze', {
        question,
        image_base64: base64,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd analizy odpowiedzi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex flex-col px-4 sm:px-8"
      style={{
        height: 'calc(100vh - 8rem)',
        width: '100vw',
        marginLeft: 'calc(-50vw + 50%)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
        >
          ← Wróć
        </button>
        <h2 className="text-lg font-bold text-gray-900">Tablica</h2>
        <div className="w-16" />
      </div>

      {/* Question */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
        <p className="text-sm font-medium text-blue-700 mb-1">Pytanie:</p>
        <MathContent>
          <p className="text-gray-900 font-semibold">{question}</p>
        </MathContent>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 bg-white rounded-xl border border-gray-200 p-3">
        <button
          onClick={() => selectTool('pen')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
            tool === 'pen'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Pisak
        </button>
        <button
          onClick={() => selectTool('eraser')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
            tool === 'eraser'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Gumka
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <button
          onClick={handleUndo}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
        >
          Cofnij
        </button>
        <button
          onClick={handleRedo}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
        >
          Ponów
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition"
        >
          Wyczyść
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Color picker */}
        <div className="flex items-center gap-1">
          {STROKE_COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => setStrokeColor(c.value)}
              title={c.label}
              className={`w-6 h-6 rounded-full border-2 transition ${
                strokeColor === c.value ? 'border-blue-500 scale-110' : 'border-gray-300'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Stroke width */}
        <div className="flex items-center gap-1">
          {STROKE_WIDTHS.map(w => (
            <button
              key={w}
              onClick={() => setStrokeWidth(w)}
              className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium transition ${
                strokeWidth === w
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {w}px
            </button>
          ))}
        </div>
      </div>

      {/* Canvas - grows to fill remaining vertical space */}
      <div className="flex-1 min-h-[300px] rounded-xl border-2 border-gray-300 overflow-hidden bg-white">
        <ReactSketchCanvas
          ref={canvasRef}
          width="100%"
          height="100%"
          strokeWidth={strokeWidth}
          strokeColor={strokeColor}
          eraserWidth={20}
          canvasColor="#ffffff"
          style={{ border: 'none', borderRadius: '0.75rem', display: 'block' }}
        />
      </div>

      {/* Submit */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
        >
          {submitting ? 'Analizuję...' : 'Sprawdź odpowiedź'}
        </button>
        {submitting && (
          <span className="text-sm text-gray-500">AI analizuje Twoje rozwiązanie...</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className={`mt-4 rounded-xl p-5 border ${
            result.poprawna
              ? 'bg-green-50 border-green-200'
              : 'bg-orange-50 border-orange-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{result.poprawna ? '✅' : '❌'}</span>
            <h3
              className={`text-lg font-bold ${
                result.poprawna ? 'text-green-800' : 'text-orange-800'
              }`}
            >
              {result.poprawna ? 'Poprawna odpowiedź!' : 'Niepoprawna odpowiedź'}
            </h3>
          </div>
          <MathContent key={result.uzasadnienie.slice(0, 50)}>
            <div
              className={`text-sm whitespace-pre-line ${
                result.poprawna ? 'text-green-700' : 'text-orange-700'
              }`}
              dangerouslySetInnerHTML={{
                __html: result.uzasadnienie.replace(
                  /\*\*(.+?)\*\*/g,
                  '<strong>$1</strong>'
                ),
              }}
            />
          </MathContent>
        </div>
      )}
    </div>
  );
}
