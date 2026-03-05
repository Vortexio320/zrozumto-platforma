import { useEffect, useRef, type ReactNode } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';

interface MathContentProps {
  children: ReactNode;
  className?: string;
}

export default function MathContent({ children, className }: MathContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      renderMathInElement(ref.current, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
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
