// Compact react-markdown overrides so AI-generated markdown (bold,
// bullet/numbered lists, headings) renders legibly inside a small chat
// bubble instead of at normal prose size/spacing. Shared between the
// AIAssistantWidget chat popup and the /ai_chats Super-Admin audit page so
// a transcript looks the same wherever it's read.
export const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-1.5 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-1.5 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-snug">{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h4 className="mb-1 mt-1.5 font-semibold first:mt-0">{children}</h4>,
  h2: ({ children }: { children?: React.ReactNode }) => <h4 className="mb-1 mt-1.5 font-semibold first:mt-0">{children}</h4>,
  h3: ({ children }: { children?: React.ReactNode }) => <h4 className="mb-1 mt-1.5 font-semibold first:mt-0">{children}</h4>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">{children}</code>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
      {children}
    </a>
  ),
};
