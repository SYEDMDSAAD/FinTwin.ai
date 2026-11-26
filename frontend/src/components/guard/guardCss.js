/* Spend Guard styles, scoped under .sg. The tokens follow the Spending Coach
   page so the two read as one product.

   The four plan segments were run through the dataviz palette checker in this
   order (bills, goals, spending, buffer): lightness band, chroma floor, CVD
   separation (worst adjacent ΔE 19.0 protan), normal-vision floor (24.4) and
   3:1 contrast all pass on #ffffff and on #0d0f17, so one set serves both
   themes. Don't re-pick these by eye, or reorder them. */
export const GUARD_CSS = `
  .sg * { box-sizing: border-box; }
  .sg {
    max-width: 640px; margin: 0 auto 96px;

    --sg-card: var(--bg-card);
    --sg-card-hover: var(--bg-card-hover);
    --sg-border: var(--border-card);
    --sg-border-strong: var(--border-card-hover);
    --sg-ink: var(--text-primary);
    --sg-ink-2: var(--text-secondary);
    --sg-ink-3: var(--text-dim);
    --sg-accent: var(--accent);
    --sg-accent-soft: var(--accent-soft);
    --sg-good: var(--good);
    --sg-good-soft: var(--good-soft);
    --sg-warn: var(--warn);
    --sg-warn-soft: var(--warn-soft);
    --sg-crit: var(--bad);
    --sg-crit-soft: var(--bad-soft);
    --sg-track: var(--bg-input);
    --sg-input: var(--bg-input);
    --sg-seg-bills: #0891b2;
    --sg-seg-goals: #d97706;
    --sg-seg-spending: #8b5cf6;
    --sg-seg-buffer: #db2777;
  }
  .sg-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .sg-eyebrow { font-size: 12px; font-weight: 500; color: var(--sg-ink-3); }
  .sg-h1 { font-size: 22px; font-weight: 650; color: var(--sg-ink); margin: 2px 0 4px; letter-spacing: -0.02em; }
  .sg-h2 { font-size: 16px; font-weight: 600; color: var(--sg-ink); margin: 0; letter-spacing: -0.01em; }
  .sg-sub { font-size: 13px; color: var(--sg-ink-3); line-height: 1.5; margin: 0; }
  .sg-p { font-size: 15px; color: var(--sg-ink-2); line-height: 1.5; margin: 0; }

  .sg-card { background: var(--sg-card); border: 1px solid var(--sg-border); border-radius: var(--radius-card); padding: 18px; }
  .sg-card + .sg-card, .sg-stack > * + * { margin-top: 12px; }

  .sg-chip {
    display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px;
    font-size: 12px; font-weight: 600; color: var(--sg-ink-2);
    background: var(--sg-track); border: none; white-space: nowrap;
  }
  .sg-chip-good { color: var(--sg-good); background: var(--sg-good-soft); }
  .sg-chip-warn { color: var(--sg-warn); background: var(--sg-warn-soft); }
  .sg-chip-crit { color: var(--sg-crit); background: var(--sg-crit-soft); }
  .sg-chips { display: flex; flex-wrap: wrap; gap: 6px; }

  .sg-tabs {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; margin-bottom: 14px;
    border-radius: 999px; background: var(--sg-track); border: none;
  }
  .sg-tab {
    display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 6px;
    border: none; border-radius: 999px; background: none; cursor: pointer; font-family: inherit;
    font-size: 13px; font-weight: 600; color: var(--sg-ink-3); transition: background 0.15s, color 0.15s;
  }
  .sg-tab[aria-selected="true"] { background: var(--sg-card); color: var(--sg-ink); box-shadow: 0 1px 2px rgba(17,17,26,0.08); }

  .sg-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 44px; padding: 10px 18px; border-radius: 999px; cursor: pointer; font-family: inherit;
    font-size: 15px; font-weight: 600; border: none;
    background: var(--sg-track); color: var(--sg-ink); transition: filter 0.15s, background 0.15s;
  }
  .sg-btn:not(:disabled):hover { filter: brightness(0.97); }
  .sg-btn:disabled { opacity: 0.55; cursor: default; }
  .sg-btn-primary { border: none; background: var(--accent-strong); color: var(--on-accent); }
  .sg-btn-primary:not(:disabled):hover { filter: brightness(1.08); }
  .sg-btn-quiet { background: none; color: var(--sg-accent); }
  .sg-btn-block { width: 100%; }
  .sg-btn-sm { min-height: 36px; padding: 6px 14px; font-size: 13px; }
  .sg-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .sg-row > .sg-btn { flex: 1 1 140px; }

  .sg-field { display: flex; flex-direction: column; gap: 6px; }
  .sg-label { font-size: 13px; font-weight: 500; color: var(--sg-ink-2); }
  .sg-input {
    width: 100%; height: 44px; padding: 0 12px; border-radius: var(--radius-control); font-family: inherit; font-size: 15px;
    color: var(--sg-ink); background: var(--sg-input); border: 1px solid transparent; outline: none;
  }
  .sg-input:focus { border-color: var(--sg-accent); }
  .sg-money { position: relative; }
  .sg-money > span { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--sg-ink-3); font-size: 15px; }
  .sg-money > .sg-input { padding-left: 26px; }
  .sg-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--sg-ink-2); cursor: pointer; }

  .sg-error {
    display: flex; gap: 8px; align-items: flex-start; padding: 11px 13px; border-radius: var(--radius-control); margin-bottom: 12px;
    font-size: 13px; line-height: 1.5; color: var(--sg-crit); background: var(--sg-crit-soft); border: none;
  }
  .sg-note { font-size: 12px; color: var(--sg-ink-3); line-height: 1.55; }

  /* Scanner */
  .sg-video {
    width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 14px; background: #000; display: block;
  }
  .sg-frame { position: relative; }
  .sg-frame::after {
    content: ""; position: absolute; inset: 18%; border: 2px solid rgba(255,255,255,0.85);
    border-radius: 16px; pointer-events: none;
  }

  /* The decision */
  .sg-payee { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sg-payee-name { font-size: 16px; font-weight: 600; color: var(--sg-ink); }
  .sg-payee-upi { font-size: 12px; color: var(--sg-ink-3); word-break: break-all; }
  .sg-amount { font-size: 28px; font-weight: 650; color: var(--sg-ink); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .sg-decision { border-left: 3px solid var(--sg-accent); }
  .sg-decision-pause { border-left-color: var(--sg-warn); }
  .sg-decision-go { border-left-color: var(--sg-good); }
  .sg-decision-insufficient { border-left-color: var(--sg-crit); }
  .sg-plan-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
  .sg-linkbtn { background: none; border: none; padding: 0; font: inherit; font-size: 12px; color: var(--sg-accent); cursor: pointer; text-decoration: underline; }
  .sg-linkbtn:disabled { opacity: 0.5; cursor: default; }
  .sg-confirm { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--sg-border); }
  .sg-message { font-size: 16px; line-height: 1.55; color: var(--sg-ink); margin: 12px 0; }
  .sg-breath { height: 4px; border-radius: 4px; background: var(--sg-track); overflow: hidden; margin: 4px 0 14px; }
  .sg-breath > div { height: 100%; width: 100%; background: var(--sg-warn); transform-origin: left; animation: sg-breathe 5s linear forwards; }
  @keyframes sg-breathe { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  /* Wallet */
  .sg-hero-label { font-size: 12px; font-weight: 600; color: var(--sg-ink-3); }
  .sg-hero { font-size: 44px; font-weight: 650; color: var(--sg-ink); letter-spacing: -0.035em; line-height: 1.05; margin: 4px 0 10px; font-variant-numeric: tabular-nums; }
  .sg-meter { height: 6px; border-radius: 999px; background: var(--sg-track); overflow: hidden; }
  .sg-meter > div { height: 100%; border-radius: 4px; background: var(--sg-accent); }
  .sg-meter-low > div { background: var(--sg-warn); }
  .sg-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
  .sg-tile { padding: 13px; border-radius: 14px; background: var(--sg-track); border: none; }
  .sg-tile-label { font-size: 11px; color: var(--sg-ink-3); line-height: 1.35; }
  .sg-tile-value { font-size: 18px; font-weight: 650; color: var(--sg-ink); margin-top: 4px; font-variant-numeric: tabular-nums; }

  .sg-list { list-style: none; margin: 0; padding: 0; }
  .sg-list > li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--sg-border); }
  .sg-list > li:first-child { border-top: none; }
  .sg-list-main { flex: 1; min-width: 0; }
  .sg-list-title { font-size: 15px; font-weight: 500; color: var(--sg-ink); }
  .sg-list-sub { font-size: 13px; color: var(--sg-ink-3); margin-top: 2px; }
  .sg-list-value { font-size: 15px; font-weight: 600; color: var(--sg-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* Payday: thin segmented bar, no text; each list row's swatch names its part */
  .sg-split { display: flex; gap: 2px; height: 8px; margin: 14px 0 6px; }
  .sg-split > div { border-radius: 4px; min-width: 4px; }
  .sg-swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }

  .sg-details > summary { cursor: pointer; list-style: none; font-size: 15px; font-weight: 600; color: var(--sg-ink); }
  .sg-details > summary::-webkit-details-marker { display: none; }

  /* Wide screens: the tabs on the left, this week's money and the rules beside them */
  .sg-aside { display: none; }
  .sg-tiles-2 { grid-template-columns: 1fr 1fr; }
  .sg-rules { margin: 10px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.55; color: var(--sg-ink-2); }
  .sg-rules li + li { margin-top: 6px; }
  @media (min-width: 1100px) {
    .sg { max-width: 1040px; }
    .sg-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
    .sg-aside { display: block; position: sticky; top: 16px; }
    .sg-aside > .sg-card + .sg-card { margin-top: 12px; }
  }

  @media (max-width: 480px) {
    .sg-tiles { gap: 8px; }
    .sg-tile { padding: 11px; }
    .sg-tile-value { font-size: 16px; }
    .sg-hero { font-size: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sg-breath > div { animation: none; transform: none; }
    .sg-btn { transition: none; }
  }
`;
