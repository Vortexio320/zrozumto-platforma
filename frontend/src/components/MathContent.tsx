import { useEffect, useRef, type ReactNode } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';

interface MathContentProps {
  children: ReactNode;
  className?: string;
}

/** Split by math blocks — preserve $$...$$ (display) before $...$ (inline) so we don't break display math */
const MATH_BLOCK_RE = /(\$\$[^$]*\$\$|\$[^$]*\$)/;

/** Wrap bare LaTeX commands (e.g. \frac{2}{3}, 60^\circ, 8\sqrt{3} \text{ cm}^2) in $...$ for KaTeX */
function wrapBareLatex(text: string): string {
  let out = text;

  // 0a. Literal \n (backslash+n) from API/DB → actual newline (whitespace-pre-line will render it)
  out = out.replace(/\\n/g, '\n');

  // 0. Fix \frac{1}{3}x -> \frac{1}{3}\!x (\! = negative thin space; avoids KaTeX excessive gap + vertical misalignment)
  out = out.replace(
    /[\\]frac\{([^{}]+)\}\{([^{}]+)\}([a-zA-Z])/g,
    (_, num, denom, letter) => `\\frac{${num}}{${denom}}\\!${letter}`,
  );

  // 0b. Single equation in <span>...</span>: wrap whole equation in $ to avoid truncation from multiple $ blocks
  const spanMatch = out.match(/^<span([^>]*)>([\s\S]*?)<\/span>$/);
  if (spanMatch) {
    const [, attrs, inner] = spanMatch;
    const eq = inner.trim();
    if (
      eq.includes('=') &&
      /[\\]frac/.test(eq) &&
      eq.length < 150 &&
      !eq.includes('$') &&
      !eq.includes('\n')
    ) {
      return `<span${attrs}>$${eq}$</span>`;
    }
  }

  // 0c. Parenthesized expressions with exponent: (200 000)^3, (2 \cdot 10^5)^3 — wrap whole
  const parenExpRe = /(\([^)]*\))\^(\d+|\{[^}]+\})/g;
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(parenExpRe, (_, base, exp) => {
        const e = exp.startsWith('{') ? exp.slice(1, -1) : exp;
        return `$${base}^{${e}}$`;
      });
    })
    .join('');

  // 0c2. Bare superscripts: 2^3, 10^5, 10^{15}, a^2, n^2 — wrap in $...$
  const superscriptRe = /(\d+(?:\s\d+)*|[a-zA-Z])\^(\d+|\{[^}]+\})/g;
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(superscriptRe, (_, base, exp) => {
        const e = exp.startsWith('{') ? exp : `{${exp}}`;
        return `$${base}^${e}$`;
      });
    })
    .join('');

  // 0c3. \left(...\right) and \left[...\right] — wrap whole (do before \frac so inner \frac stays in one block)
  const leftRightRe =
    /[\\]left\s*([([])([^()[\]]*(?:\([^()]*\)|\[[^[\]]*\][^()[\]]*)*)[\\]right\s*([)\]])/g;
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(leftRightRe, (_, open, inner, close) => `$\\left${open}${inner}\\right${close}$`);
    })
    .join('');

  // 1. \frac{}{} — wrap bare \frac in $ (do BEFORE \cdot so \frac{(x+y)\cdot h}{2} stays intact)
  const fracRe =
    /[\\]frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}( [a-zA-Z]|\\![a-zA-Z])?/g;
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(fracRe, (_, a, b, trailing) => `$\\frac{${a}}{${b}}${trailing ?? ''}$`);
    })
    .join('');

  // 0d. Bare \cdot (multiplication dot) — wrap in $...$
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(/[\\]cdot(?!\w)/g, '$\\cdot$');
    })
    .join('');

  // 2. Degree: 60^\circ, 90^\circ — wrap bare only; skip inside $...$
  const circRe = /(\d+)\^[\\]circ(?!\d)/g;
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(circRe, (_, n) => `$${n}^\\circ$`);
    })
    .join('');

  // 3. \sqrt{...} with optional \text{...} and superscript — wrap bare only; skip inside $...$
  const sqrtRe =
    /(\d*)[\\]sqrt\{([^{}]+)\}(\s*[\\]text\{([^{}]*)\})?(\^\d+)?/g;
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(sqrtRe, (_, pre, inner, textPart, _textInner, sup) => {
        const tp = textPart ?? '';
        const sp = sup ?? '';
        return `$${pre}\\sqrt{${inner}}${tp}${sp}$`;
      });
    })
    .join('');

  // 4. Standalone \text{...} with optional superscript (only in non-math segments to avoid double-wrap)
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(
        /[\\]text\{([^{}]*)\}(\^\d+)?/g,
        (_, inner, sup) => `$\\text{${inner}}${sup ?? ''}$`,
      );
    })
    .join('');

  // 5. Bare Greek letters (e.g. \alpha, \beta, \gamma) — wrap in $...$ for KaTeX
  const greekRe =
    /\\(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega)(?![a-zA-Z])/g;
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(greekRe, (_, cmd) => `$\\${cmd}$`);
    })
    .join('');

  // 6. Bare comparison/relation symbols (e.g. \geq, \leq, \neq) — wrap in $...$
  const relationRe = /\\(geq|leq|neq|approx|equiv|pm|mp|times|div)(?!\w)/g;
  out = out
    .split(MATH_BLOCK_RE)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      return part.replace(relationRe, (_, cmd) => `$\\${cmd}$`);
    })
    .join('');

  return out;
}

export default function MathContent({ children, className }: MathContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      const el = ref.current;
      const html = el.innerHTML;
      if (/\\frac\{|[\\]sqrt\{|[\\]text\{|\d+\^[\\]circ|\\(alpha|beta|gamma|delta|epsilon|theta|pi|sigma|omega)\b|\\n|[\\]left|[\\]cdot|\\right|\d+\^|\)\^|[a-zA-Z]\^|[\\]geq|[\\]leq|[\\]neq/.test(html)) {
        el.innerHTML = wrapBareLatex(html);
      }
      renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
      });
    } catch (e) {
      console.warn('KaTeX render failed:', e);
    }
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
