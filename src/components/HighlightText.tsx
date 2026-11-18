import { splitTextByHighlight } from '../lib/chatLogic';

interface HighlightTextProps {
  text: string;
  query?: string;
  active?: boolean;
}

export function HighlightText({ text, query = '', active = false }: HighlightTextProps) {
  const parts = splitTextByHighlight(text, query);
  if (parts.length === 0) return null;

  return (
    <>
      {parts.map((part, idx) =>
        part.match ? (
          <mark
            key={`${idx}_${part.text}`}
            className={`rounded-xs px-0.5 font-semibold transition-colors ${
              active
                ? 'bg-amber-400 text-[#111B21] ring-1 ring-amber-600/40'
                : 'bg-[#FDE68A] dark:bg-amber-400/35 text-[#111B21] dark:text-[#FEF08A]'
            }`}
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${idx}_${part.text}`}>{part.text}</span>
        )
      )}
    </>
  );
}
