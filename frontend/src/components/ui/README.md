# FinTwin UI kit

One look for every screen, in light and dark. Build new UI from these pieces
and tokens; move old screens onto them when you touch them.

## Tokens

Defined in `src/index.css` (both themes) and mapped into Tailwind
(`tailwind.config.js`), so a class follows the theme by itself.

| Use | Classes |
|---|---|
| Card surface | `bg-surface`, `bg-surface-hover`, `bg-surface-sunken` (inputs), `bg-surface-raised` (menus) |
| Text | `text-ink` (main), `text-ink-2` (secondary), `text-ink-3` (hints) |
| Borders | `border-line`, `border-line-strong` |
| Accent | `bg-accent-strong text-accent-on` (filled), `bg-accent-soft text-accent` (tinted), `text-accent` |
| Status | `text-good/bad/warn/info`, `bg-good-soft` … |
| Shape | `rounded-card`, `rounded-control`, `shadow-card`, `shadow-raised` |
| Type | `text-display` (the one big number), `text-title`, `text-heading`, `text-body`, `text-small`, `text-caption` |

## Rules

- **No hard-coded colours** (`#fff`, `#e2e8f0`, `rgba(255,255,255,…)`): they
  only look right in one theme.
- **Never `text-white`**: the light theme repaints it dark. On a filled
  accent use `text-accent-on`.
- **No page titles inside a section.** The screen's name is in `TabHeader`;
  inside, use `SectionHeader` (an h2).
- **One primary button per screen.** Everything else is `secondary`,
  `soft` or `ghost`.
- **Status colours mean status**: green good, red bad, amber watch. Not decoration.
- Tailwind opacity modifiers (`bg-accent/20`) don't work on these tokens;
  use the `-soft` variants.

## Components

```jsx
import { Card, Button, Badge, SectionHeader, Stat, EmptyState } from "../components/ui";

<Card>…</Card>                         // section; pad="sm|md|lg|none", tone="good|bad|warn|info|accent"
<Card onClick={open}>…</Card>          // the whole card is a button
<SectionHeader title="Budgets" subtitle="This month" action={<Button size="sm">Add</Button>} />
<Stat label="Left this month" value="₹4,275" note="7 days left" size="lg" tone="bad" />
<Button variant="primary|secondary|soft|ghost|danger" size="sm|md|lg" icon={Plus}>Add</Button>
<Badge tone="warn">Near limit</Badge>
<EmptyState icon={Target} title="No goals yet" body="…" action={<Button>Set a goal</Button>} />
```

`components/HomeOverview.jsx` is the reference screen.
