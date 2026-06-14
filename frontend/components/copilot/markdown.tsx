import * as React from "react";

/** Tiny, safe markdown-ish renderer: **bold**, `code`, bullet lists, line breaks. */
export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flush = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul key={key} className="my-1.5 space-y-1 pl-1">
          {list.map((li, i) => (
            <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{inline(li)}</span>
            </li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^\s*[-*•]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*•]\s+/, ""));
    } else {
      flush(`l-${i}`);
      if (line.trim() === "") {
        blocks.push(<div key={`sp-${i}`} className="h-1.5" />);
      } else {
        blocks.push(
          <p key={`p-${i}`} className="text-[13.5px] leading-relaxed text-ink-2">
            {inline(line)}
          </p>
        );
      }
    }
  });
  flush("end");
  return <div className="space-y-0.5">{blocks}</div>;
}

function inline(text: string): React.ReactNode {
  // Split on **bold** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return (
        <strong key={i} className="font-semibold text-ink">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-accent-ink">
          {p.slice(1, -1)}
        </code>
      );
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}
