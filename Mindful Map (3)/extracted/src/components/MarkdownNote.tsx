import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownNote({ source }: { source: string }) {
  if (!source.trim()) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Henüz not yok. Markdown destekli: **kalın**, *italik*, - liste, [link](url), `kod`.
      </p>
    );
  }
  return (
    <div className="prose-mint text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...p }) => (
            <a {...p} target="_blank" rel="noreferrer" className="text-primary underline" />
          ),
          ul: ({ node: _n, ...p }) => <ul {...p} className="my-2 list-disc pl-5 space-y-1" />,
          ol: ({ node: _n, ...p }) => <ol {...p} className="my-2 list-decimal pl-5 space-y-1" />,
          h1: ({ node: _n, ...p }) => <h1 {...p} className="mt-3 mb-1 text-lg font-bold" />,
          h2: ({ node: _n, ...p }) => <h2 {...p} className="mt-3 mb-1 text-base font-bold" />,
          h3: ({ node: _n, ...p }) => <h3 {...p} className="mt-2 mb-1 text-sm font-bold" />,
          p: ({ node: _n, ...p }) => <p {...p} className="my-1.5" />,
          code: ({ node: _n, ...p }) => (
            <code {...p} className="rounded bg-muted px-1 py-0.5 text-[0.85em]" />
          ),
          blockquote: ({ node: _n, ...p }) => (
            <blockquote {...p} className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground" />
          ),
          input: ({ node: _n, ...p }) => (
            <input {...p} disabled className="mr-1 align-middle accent-primary" />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
