import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Sparkles, ListChecks, Flag, Scissors, Clock, AlertTriangle,
  ShieldAlert, ChevronDown,
} from "lucide-react";

// The planner emits a fixed section skeleton (a headline paragraph, then
// "### Section" blocks of "- " bullets). Parsing it here rather than handing
// the whole string to ReactMarkdown is what makes the milestone track and the
// section chips possible — and react-markdown ships without remark-gfm, so
// generic markdown gets us plain grey bullets and nothing else.
//
// Plans written before this format exist in the database and are never
// rewritten unless the user regenerates, so anything without a "### " heading
// falls through to the old renderer instead of being mangled.
export function parsePlan(markdown) {
  const text = (markdown || "").trim();
  if (!text || !text.includes("### ")) return null;

  const headlineLines = [];
  const sections = [];
  let current = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("### ")) {
      current = { title: line.slice(4).trim(), items: [] };
      sections.push(current);
    } else if (line.startsWith("- ")) {
      const item = line.slice(2).trim();
      if (current) current.items.push(item);
    } else if (!current) {
      headlineLines.push(line);
    }
  }

  if (!sections.length) return null;
  return { headline: headlineLines.join(" "), sections };
}

// "Month 3 — ₹75,000 saved (25%)" — the one bullet shape worth rendering as
// something other than a bullet. A milestone that fails to match is shown as
// ordinary text rather than dropped.
const MILESTONE = /^Month\s+(\d+)\s+—\s+(₹[\d,]+)\s+saved\s+\((\d+)%\)$/;

const SECTION_META = {
  "Do this now": { icon: ListChecks, color: "#a78bfa" },
  "Milestones": { icon: Flag, color: "#22d3ee" },
  "Where the money comes from": { icon: Scissors, color: "#4ade80" },
  "The honest timeline": { icon: Clock, color: "#fbbf24" },
  "Watch out": { icon: AlertTriangle, color: "#fbbf24" },
  "Biggest risk": { icon: ShieldAlert, color: "#f87171" },
};
const DEFAULT_META = { icon: Sparkles, color: "#a78bfa" };

// Only **bold** is emitted by the planner, and only around figures worth
// pulling out of the sentence. Split rather than inject: the plan is model
// output, and it never becomes markup.
function Inline({ text, accent }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} style={{ color: accent, fontWeight: 700 }}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function MilestoneTrack({ items }) {
  const parsed = items.map(item => item.match(MILESTONE));
  if (parsed.some(m => !m)) {
    return <BulletList items={items} accent="#22d3ee" />;
  }
  return (
    <ol className="m-0 list-none space-y-0 p-0">
      {parsed.map((m, i) => {
        const [, month, amount, share] = m;
        const last = i === parsed.length - 1;
        return (
          <li key={month} className="flex gap-3">
            {/* Dot + connector: the rail is what makes four rows read as one
                schedule rather than four unrelated numbers. */}
            <div className="flex flex-col items-center pt-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: last ? "#4ade80" : "#22d3ee" }}
              />
              {!last && <span className="w-px flex-1 bg-white/10" />}
            </div>
            <div className={`flex min-w-0 flex-1 items-baseline justify-between gap-3 ${last ? "" : "pb-3"}`}>
              <span className="text-[13px] text-zinc-400">Month {month}</span>
              <span className="flex items-baseline gap-2">
                <span className="text-[13px] font-bold text-zinc-200">{amount}</span>
                <span className="text-[11px] tabular-nums text-zinc-500">{share}%</span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function BulletList({ items, accent }) {
  return (
    <ul className="m-0 list-none space-y-2.5 p-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: accent, opacity: 0.7 }}
          />
          <span className="text-[13.5px] leading-6 text-zinc-300">
            <Inline text={item} accent={accent} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, items }) {
  const { icon: Icon, color } = SECTION_META[title] || DEFAULT_META;
  return (
    <div>
      <div
        className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ color }}
      >
        <Icon size={11} /> {title}
      </div>
      {title === "Milestones"
        ? <MilestoneTrack items={items} />
        : <BulletList items={items} accent={color} />}
    </div>
  );
}

/**
 * The AI plan on a goal card.
 *
 * Plans are now long enough to bury everything below them on a two-column
 * grid, so only the headline and the first section are shown until asked —
 * the collapsed state still answers "does this goal work?", which is the
 * question the card exists for.
 */
function AIPlanCard({ plan, regenerating }) {
  const parsed = useMemo(() => parsePlan(plan), [plan]);
  const [expanded, setExpanded] = useState(false);

  const header = (
    <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.1em] text-purple-400/70">
      <Sparkles size={11} /> AI PLAN
    </div>
  );

  const shell = (children) => (
    <div
      className="mb-4 rounded-xl border border-purple-500/15 bg-white/[0.02] p-4 transition-opacity duration-300"
      style={{ opacity: regenerating ? 0.45 : 1 }}
      aria-busy={regenerating || undefined}
    >
      {header}
      {children}
    </div>
  );

  if (!plan) {
    return shell(
      <div className="text-sm text-zinc-500">
        No plan generated yet — hit “Regenerate AI Plan” below.
      </div>
    );
  }

  // Legacy single-paragraph plans, still stored on goals created before the
  // structured planner. Rendered as they always were.
  if (!parsed) {
    return shell(
      <div className="text-[15px] leading-7 text-zinc-300">
        <ReactMarkdown>{plan}</ReactMarkdown>
      </div>
    );
  }

  const visible = expanded ? parsed.sections : parsed.sections.slice(0, 1);
  const hidden = parsed.sections.length - visible.length;

  return shell(
    <>
      {parsed.headline && (
        <p className="mb-4 text-[15px] font-semibold leading-6 text-zinc-100">
          {parsed.headline}
        </p>
      )}

      <div className="space-y-4">
        {visible.map(section => (
          <Section key={section.title} title={section.title} items={section.items} />
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-purple-300 transition-colors hover:text-purple-200"
        >
          Show full plan — {hidden} more section{hidden > 1 ? "s" : ""}
          <ChevronDown size={12} />
        </button>
      )}
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Show less
          <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} />
        </button>
      )}
    </>
  );
}

export default AIPlanCard;
