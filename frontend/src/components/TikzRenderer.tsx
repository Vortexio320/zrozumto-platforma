import { useEffect, useState } from 'react';

/**
 * TikzRenderer - renders TikZ code as SVG via server-side pdflatex + pdf2svg.
 * Avoids tikzjax nullfont issues in the browser.
 */

interface TikzRendererProps {
  code: string;
}

function decodeTikzCode(raw: string): string {
  // Only replace when used as escapes, NOT when part of \node, \nabla, \frac, \theta, etc.
  return raw
    .replace(/\\n(?![a-zA-Z])/g, '\n')
    .replace(/\\t(?![a-zA-Z])/g, '\t');
}

function toBase64Utf8(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

export default function TikzRenderer({ code }: TikzRendererProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSvg(null);

    const decoded = decodeTikzCode(code);
    const t = toBase64Utf8(decoded);

    fetch('/api/tikz-svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
          console.error('[TikzRenderer] Server error:', res.status, detail);
          console.error('[TikzRenderer] TikZ code (first 600 chars):', decoded.slice(0, 600));
          throw new Error(detail || `HTTP ${res.status}`);
        }
        return res.text();
      })
      .then((text) => {
        setSvg(text);
        setError(null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Nie udało się wyrenderować diagramu.';
        console.error('[TikzRenderer] Render failed:', msg);
        setError(msg);
        setSvg(null);
      })
      .finally(() => setLoading(false));
  }, [code]);

  if (!code) return null;

  return (
    <div className="my-4 flex flex-col items-center overflow-x-auto">
      {loading && (
        <div className="py-8 text-sm text-gray-500">Renderowanie diagramu...</div>
      )}
      {svg && (
        <div
          className="w-full [&_svg]:max-w-full [&_svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {error && (
        <p className="mt-2 text-sm text-amber-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
