import ReactMarkdown from "react-markdown";

// AI-written text, rendered as markdown without the two things an injected
// instruction could use against the reader:
// - images: the browser fetches them on its own, so an image address can
//   carry the user's figures to whoever wrote a payment note telling the
//   model to add one;
// - clickable links: a "verify your account" link in an answer would look
//   like FinTwin saying it.
// The AI service already strips both; this is the second lock. Raw HTML is
// never rendered (react-markdown's default, kept by not adding rehype-raw).
const components = {
  a: ({ children }) => <span>{children}</span>,
};

export default function SafeMarkdown({ children }) {
  return (
    <ReactMarkdown
      disallowedElements={["img"]}
      unwrapDisallowed={false}
      components={components}
      skipHtml
    >
      {children}
    </ReactMarkdown>
  );
}
