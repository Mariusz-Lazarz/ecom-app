import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

// Styles for what the assistant writes: short paragraphs, lists, bold, links, the odd table.
// Raw HTML in replies is not rendered, and react-markdown drops unsafe link protocols.
const components: Components = {
  p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 marker:text-muted-foreground">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
      {children}
    </a>
  ),
  h1: ({ children }) => <p className="mt-3 font-semibold first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mt-3 font-semibold first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-3 font-semibold first:mt-0">{children}</p>,
  code: ({ children }) => (
    <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-md bg-background/70 p-2 text-xs [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border/60 px-2 py-1 align-top">{children}</td>,
}

/** An assistant reply, written in Markdown. */
export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="text-sm break-words">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  )
}
