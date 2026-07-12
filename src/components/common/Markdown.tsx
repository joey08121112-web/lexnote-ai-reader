import { cn } from '@/lib/utils';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code class="bg-black/5 px-1.5 py-0.5 rounded text-[0.85em] font-mono">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[#D4A574] underline hover:opacity-80">$1</a>');
  return html;
}

interface MarkdownProps {
  content: string;
  className?: string;
}

export default function Markdown({ content, className }: MarkdownProps) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre key={key++} className="bg-[#2D2A26] text-[#E8E4DE] rounded-xl p-3 my-2 overflow-x-auto text-xs">
          {lang && <div className="text-xs text-[#9B8E84] mb-2 font-mono">{lang}</div>}
          <code className="font-mono whitespace-pre-wrap">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc list-outside ml-4 my-1 space-y-0.5">
          {items.map((item, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal list-outside ml-4 my-1 space-y-0.5">
          {items.map((item, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
          ))}
        </ol>
      );
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      const level = (line.match(/^#+/) || [''])[0].length;
      const text = line.replace(/^#+\s+/, '');
      const Tag = `h${Math.min(level, 3)}` as keyof JSX.IntrinsicElements;
      const sizeClass = level === 1 ? 'text-base font-bold mt-3 mb-1' : level === 2 ? 'text-sm font-bold mt-2 mb-1' : 'text-sm font-semibold mt-2 mb-0.5';
      blocks.push(
        <Tag key={key++} className={sizeClass} dangerouslySetInnerHTML={{ __html: renderInline(text) }} />
      );
      i++;
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="border-l-2 border-[#D4A574]/40 pl-3 my-2 text-[#6B5E54] italic">
          {quoteLines.map((ql, j) => (
            <p key={j} dangerouslySetInnerHTML={{ __html: renderInline(ql) }} />
          ))}
        </blockquote>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !lines[i].startsWith('> ')) {
      paragraphLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderInline(paragraphLines.join(' ')) }} />
    );
  }

  return <div className={cn('text-sm', className)}>{blocks}</div>;
}
