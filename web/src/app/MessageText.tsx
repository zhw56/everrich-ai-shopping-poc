import type { ReactNode } from 'react';
import { safeUrl } from './types';
// Render a small, safe Markdown subset without evaluating HTML from model output.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(part);
    if (link && safeUrl(link[2])) return <a key={i} href={safeUrl(link[2])} target="_blank" rel="noreferrer">{link[1]} ↗</a>;
    return part;
  });
}
export function MessageText({ text }: { text: string }) {
  return <div className="message-text">{text.split(/\n\s*\n/).map((block, i) => {
    const lines = block.split('\n');
    if (lines.every(line => /^\s*[-*] /.test(line))) return <ul key={i}>{lines.map((line, n) => <li key={n}>{inline(line.replace(/^\s*[-*] /, ''))}</li>)}</ul>;
    if (lines.every(line => /^\s*\d+[.)] /.test(line))) return <ol key={i}>{lines.map((line, n) => <li key={n}>{inline(line.replace(/^\s*\d+[.)] /, ''))}</li>)}</ol>;
    if (/^#{1,4} /.test(block)) return <p key={i}><strong>{inline(block.replace(/^#{1,4} /, ''))}</strong></p>;
    return <p key={i}>{inline(block)}</p>;
  })}</div>;
}
