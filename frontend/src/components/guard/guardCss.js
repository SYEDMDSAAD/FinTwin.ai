/* Spend Guard styles, scoped under .sg. The tokens follow the Spending Coach
   page so the two read as one product.

   The four plan segments were run through the dataviz palette checker in this
   order (bills, goals, spending, buffer): lightness band, chroma floor, CVD
   separation (worst adjacent ΔE 19.0 protan), normal-vision floor (24.4) and
   3:1 contrast all pass on #ffffff and on #0d0f17, so one set serves both
   themes. Don't re-pick these by eye, or reorder them. */
export const GUARD_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');

  .sg * { box-sizing: border-box; }
  .sg {
    font-family: 'DM Sans', system-ui, sans-serif;
    max-width: 640px; margin: 0 auto 96px;

    --sg-card: rgba(255,255,255,0.025);
    --sg-card-hover: rgba(255,255,255,0.045);
    --sg-border: rgba(255,255,255,0.08);
    --sg-border-strong: rgba(255,255,255,0.14);
    --sg-ink: #e8eaf0;
    --sg-ink-2: rgba(203,213,225,0.78);
    --sg-ink-3: rgba(148,163,184,0.62);
    --sg-accent: #a78bfa;
    --sg-accent-soft: rgba(167,139,250,0.12);
    --sg-good: #4ade80;
    --sg-good-soft: rgba(74,222,128,0.10);
    --sg-warn: #fbbf24;
    --sg-warn-soft: rgba(251,191,36,0.10);
    --sg-crit: #f87171;
    --sg-crit-soft: rgba(248,113,113,0.10);
    --sg-track: rgba(167,139,250,0.16);
    --sg-input: rgba(255,255,255,0.04);
    --sg-seg-bills: #0891b2;
    --sg-seg-goals: #d97706;
    --sg-seg-spending: #8b5cf6;
    --sg-seg-buffer: #db2777;
  }
  :root[data-theme="light"] .sg {
    --sg-card: #ffffff;
    --sg-card-hover: #fbfaff;
    --sg-border: rgba(109,40,217,0.13);
    --sg-border-strong: rgba(109,40,217,0.24);
    --sg-ink: #0f172a;
    --sg-ink-2: rgba(30,41,59,0.82);
    --sg-ink-3: rgba(51,65,85,0.62);
    --sg-accent: #7c3aed;
    --sg-accent-soft: rgba(124,58,237,0.09);
    --sg-good: #0a7d0a;
    --sg-good-soft: rgba(12,163,12,0.08);
    --sg-warn: #b45309;
    --sg-warn-soft: rgba(180,83,9,0.08);
    --sg-crit: #c42f2f;
    --sg-crit-soft: rgba(208,59,59,0.08);
    --sg-track: rgba(124,58,237,0.12);
    --sg-input: #ffffff;
  }

  .sg-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .sg-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: var(--sg-ink-3); }
  .sg-h1 { font-size: 22px; font-weight: 700; color: var(--sg-ink); margin: 2px 0 4px; letter-spacing: -0.02em; }
  .sg-h2 { font-size: 14px; font-weight: 700; color: var(--sg-ink); margin: 0; letter-spacing: -0.01em; }
  .sg-sub { font-size: 12.5px; color: var(--sg-ink-3); line-height: 1.55; margin: 0; }
  .sg-p { font-size: 14px; color: var(--sg-ink-2); line-height: 1.6; margin: 0; }

  .sg-card { background: var(--sg-card); border: 1px solid var(--sg-border); border-radius: 18px; padding: 18px; }
  .sg-card + .sg-card, .sg-stack > * + * { margin-top: 12px; }
  :root[data-theme="light"] .sg-card { box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(109,40,217,0.06); }

  .sg-chip {
    display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px;
    font-size: 11px; font-weight: 600; color: var(--sg-ink-2);
    background: var(--sg-accent-soft); border: 1px solid var(--sg-border); white-space: nowrap;
  }
  .sg-chip-good { color: var(--sg-good); background: var(--sg-good-soft); }
  .sg-chip-warn { color: var(--sg-warn); background: var(--sg-warn-soft); }
  .sg-chip-crit { color: var(--sg-crit); background: var(--sg-crit-soft); }
  .sg-chips { display: flex; flex-wrap: wrap; gap: 6px; }

  .sg-tabs {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; margin-bottom: 14px;
    border-radius: 14px; background: var(--sg-card); border: 1px solid var(--sg-border);
  }
  .sg-tab {
    display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 6px;
    border: none; border-radius: 10px; background: none; cursor: pointer; font-family: inherit;
    font-size: 13px; font-weight: 600; color: var(--sg-ink-3); transition: background 0.15s, color 0.15s;
  }
  .sg-tab[aria-selected="true"] { background: var(--sg-accent-soft); color: var(--sg-accent); }

  .sg-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    padding: 11px 16px; border-radius: 12px; cursor: pointer; font-family: inherit;
    font-size: 13.5px; font-weight: 700; border: 1px solid var(--sg-border-strong);
    background: var(--sg-accent-soft); color: var(--sg-accent); transition: transform 0.15s, background 0.15s;
  }
  .sg-btn:not(.sg-btn-primary):not(:disabled):hover { background: var(--sg-card-hover); }
  .sg-btn:not(:disabled):hover { transform: translateY(-1px); }
  .sg-btn:disabled { opacity: 0.55; cursor: default; }
  .sg-btn-primary { border: none; background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff; }
  .sg-btn-primary:not(:disabled):hover { box-shadow: 0 6px 18px rgba(124,58,237,0.35); }
  .sg-btn-quiet { background: none; border-color: var(--sg-border); color: var(--sg-ink-2); }
  .sg-btn-block { width: 100%; }
  .sg-btn-sm { padding: 7px 11px; font-size: 12px; border-radius: 10px; }
  .sg-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .sg-row > .sg-btn { flex: 1 1 140px; }

  .sg-field { display: flex; flex-direction: column; gap: 6px; }
  .sg-label { font-size: 12px; font-weight: 600; color: var(--sg-ink-2); }
  .sg-input {
    width: 100%; padding: 11px 12px; border-radius: 12px; font-family: inherit; font-size: 15px;
    color: var(--sg-ink); background: var(--sg-input); border: 1px solid var(--sg-border-strong); outline: none;
  }
  .sg-input:focus { border-color: var(--sg-accent); box-shadow: 0 0 0 3px var(--sg-accent-soft); }
  .sg-money { position: relative; }
  .sg-money > span { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--sg-ink-3); font-size: 15px; }
  .sg-money > .sg-input { padding-left: 26px; }
  .sg-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--sg-ink-2); cursor: pointer; }

  .sg-error {
    display: flex; gap: 8px; align-items: flex-start; padding: 11px 13px; border-radius: 12px; margin-bottom: 12px;
    font-size: 13px; line-height: 1.5; color: var(--sg-crit); background: var(--sg-crit-soft); border: 1px solid var(--sg-border);
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
  .sg-payee-name { font-size: 16px; font-weight: 700; color: var(--sg-ink); }
  .sg-payee-upi { font-size: 12px; color: var(--sg-ink-3); word-break: break-all; }
  .sg-amount { font-size: 26px; font-weight: 800; color: var(--sg-ink); letter-spacing: -0.02em; }
  .sg-decision { border-left: 3px solid var(--sg-accent); }
  .sg-decision-pause { border-left-color: var(--sg-warn); }
  .sg-decision-go { border-left-color: var(--sg-good); }
  .sg-decision-insufficient { border-left-color: var(--sg-crit); }
  .sg-message { font-size: 16px; line-height: 1.55; color: var(--sg-ink); margin: 12px 0; }
  .sg-breath { height: 4px; border-radius: 4px; background: var(--sg-track); overflow: hidden; margin: 4px 0 14px; }
  .sg-breath > div { height: 100%; width: 100%; background: var(--sg-warn); transform-origin: left; animation: sg-breathe 5s linear forwards; }
  @keyframes sg-breathe { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  /* Wallet */
  .sg-hero-label { font-size: 12px; font-weight: 600; color: var(--sg-ink-3); }
  .sg-hero { font-size: 48px; font-weight: 800; color: var(--sg-ink); letter-spacing: -0.035em; line-height: 1.05; margin: 4px 0 10px; }
  .sg-meter { height: 8px; border-radius: 4px; background: var(--sg-track); overflow: hidden; }
  .sg-meter > div { height: 100%; border-radius: 4px; background: var(--sg-accent); }
  .sg-meter-low > div { background: var(--sg-warn); }
  .sg-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
  .sg-tile { padding: 13px; border-radius: 14px; background: var(--sg-card); border: 1px solid var(--sg-border); }
  .sg-tile-label { font-size: 11px; color: var(--sg-ink-3); line-height: 1.35; }
  .sg-tile-value { font-size: 18px; font-weight: 700; color: var(--sg-ink); margin-top: 4px; }

  .sg-list { list-style: none; margin: 0; padding: 0; }
  .sg-list > li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--sg-border); }
  .sg-list > li:first-child { border-top: none; }
  .sg-list-main { flex: 1; min-width: 0; }
  .sg-list-title { font-size: 13.5px; font-weight: 600; color: var(--sg-ink); }
  .sg-list-sub { font-size: 11.5px; color: var(--sg-ink-3); margin-top: 2px; }
  .sg-list-value { font-size: 13.5px; font-weight: 700; color: var(--sg-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* Payday: thin segmented bar, no text; each list row's swatch names its part */
  .sg-split { display: flex; gap: 2px; height: 8px; margin: 14px 0 6px; }
  .sg-split > div { border-radius: 4px; min-width: 4px; }
  .sg-swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }

  .sg-details > summary { cursor: pointer; list-style: none; font-size: 13px; font-weight: 700; color: var(--sg-ink); }
  .sg-details > summary::-webkit-details-marker { display: none; }

  @media (max-width: 480px) {
    .sg-tiles { grid-template-columns: 1fr 1fr; }
    .sg-hero { font-size: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sg-breath > div { animation: none; transform: none; }
    .sg-btn { transition: none; }
  }
`;
