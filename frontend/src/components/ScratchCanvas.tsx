import { useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { ReactSketchCanvas, type ReactSketchCanvasRef } from 'react-sketch-canvas';

export interface ScratchCanvasHandle {
  exportImageIfDrawn: () => Promise<string | null>;
}

interface ScratchCanvasProps {
  defaultExpanded?: boolean;
  /** When false, canvas is always visible with no expand/collapse button */
  collapsible?: boolean;
}

type Tool = 'pen' | 'eraser';

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 192;

const ScratchCanvas = forwardRef<ScratchCanvasHandle, ScratchCanvasProps>(
  function ScratchCanvas({ defaultExpanded = false, collapsible = true }, ref) {
    const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [tool, setTool] = useState<Tool>('pen');
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

    const isExpanded = collapsible ? expanded : true;

    const startResize = useCallback(
      (clientY: number) => {
        resizeStateRef.current = { startY: clientY, startHeight: height };
        const updateHeight = (currentY: number) => {
          const state = resizeStateRef.current;
          if (!state) return;
          const delta = currentY - state.startY;
          setHeight(() =>
            Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, state.startHeight + delta))
          );
        };
        const onMouseMove = (e: MouseEvent) => updateHeight(e.clientY);
        const onTouchMove = (e: TouchEvent) => {
          e.preventDefault();
          updateHeight(e.touches[0].clientY);
        };
        const cleanup = () => {
          resizeStateRef.current = null;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', cleanup);
          window.removeEventListener('touchmove', onTouchMove, { capture: true });
          window.removeEventListener('touchend', cleanup);
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', cleanup);
        window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
        window.addEventListener('touchend', cleanup);
      },
      [height]
    );

    const handleResizeStart = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        startResize(e.clientY);
      },
      [startResize]
    );

    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        e.preventDefault();
        startResize(e.touches[0].clientY);
      },
      [startResize]
    );

    useImperativeHandle(ref, () => ({
      async exportImageIfDrawn() {
        if (!canvasRef.current) return null;
        const paths = await canvasRef.current.exportPaths();
        if (!paths || paths.length === 0) return null;
        const dataUrl = await canvasRef.current.exportImage('png');
        return dataUrl.replace(/^data:image\/png;base64,/, '');
      },
    }));

    function selectTool(t: Tool) {
      setTool(t);
      canvasRef.current?.eraseMode(t === 'eraser');
    }

    return (
      <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition text-sm font-medium text-gray-700"
          >
            <span>Miejsce na obliczenia</span>
            <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
          </button>
        ) : (
          <div className="px-4 py-2.5 bg-gray-50 text-sm font-medium text-gray-700">
            Rozwiąż na tablicy
          </div>
        )}

        {isExpanded && (
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => selectTool('pen')}
                className={`px-2 py-1 mx-2 rounded text-xs font-medium transition ${
                  tool === 'pen'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Pisak
              </button>
              <button
                type="button"
                onClick={() => selectTool('eraser')}
                className={`px-2 py-1 mx-2 rounded text-xs font-medium transition ${
                  tool === 'eraser'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Gumka
              </button>
              <button
                type="button"
                onClick={() => canvasRef.current?.undo()}
                className="px-2 py-1 mx-2 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
              >
                Cofnij
              </button>
              <button
                type="button"
                onClick={() => canvasRef.current?.clearCanvas()}
                className="px-2 py-1 mx-2 rounded text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition"
              >
                Wyczyść
              </button>
            </div>
            <div className="relative rounded-lg border border-gray-300 overflow-hidden bg-white">
              <div style={{ height }} className="overflow-hidden">
                <ReactSketchCanvas
                  ref={canvasRef}
                  width="100%"
                  height="100%"
                  strokeWidth={3}
                  strokeColor="#000000"
                  eraserWidth={15}
                  canvasColor="#ffffff"
                  style={{ border: 'none', display: 'block' }}
                />
              </div>
              <div
                role="separator"
                aria-label="Przeciągnij, aby zmienić wysokość"
                tabIndex={0}
                onMouseDown={handleResizeStart}
                onTouchStart={handleTouchStart}
                style={{ touchAction: 'none' }}
                className="absolute bottom-0 left-0 right-0 h-11 min-h-[44px] cursor-ns-resize flex items-center justify-center bg-gray-50/80 hover:bg-blue-50 active:bg-blue-100 transition-colors"
              >
                <span className="opacity-60 text-gray-500 text-sm select-none">
                  ⋮⋮
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default ScratchCanvas;
