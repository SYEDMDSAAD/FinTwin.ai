import { useState, useEffect } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import API from "../services/api";
import { SectionHeader, Badge, Button, Progress } from "./ui";

const SCORE_BANDS = [
  { label: "Poor",      min: 300, max: 549, tone: "bad" },
  { label: "Fair",      min: 550, max: 649, tone: "warn" },
  { label: "Good",      min: 650, max: 749, tone: "good" },
  { label: "Very good", min: 750, max: 799, tone: "good" },
  { label: "Excellent", min: 800, max: 900, tone: "good" },
];

// Fallback only — the backend sends the authoritative `band` with the score;
// the local table is for the gauge and for older responses that lack it.
function getBand(score) {
  return SCORE_BANDS.find(b => score >= b.min && score <= b.max) || SCORE_BANDS[0];
}

/** 300 to 900 on one line, a dot where the score sits. */
function ScoreGauge({ score }) {
  const pct = Math.min(Math.max((score - 300) / 600, 0), 1) * 100;
  return (
    <div className="mt-4" aria-hidden>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-[var(--bad)] via-[var(--warn)] to-[var(--good)] opacity-80">
        <span className="absolute -top-[5px] w-4 h-4 rounded-full bg-surface border-[3px] border-ink transition-[left] duration-700"
              style={{ left: `calc(${pct}% - 8px)` }} />
      </div>
      <div className="mt-2 flex justify-between text-caption text-ink-3 num"><span>300</span><span>900</span></div>
    </div>
  );
}

export default function CreditScoreCard() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [checking, setChecking] = useState(false);
  const [error,    setError]    = useState(false);
  // Collapsed by default — only matters on mobile (`lg:` forces it open below).
  const [factorsOpen, setFactorsOpen] = useState(false);

  const fetchScore = async () => {
    setChecking(true);
    setError(false);
    try {
      const res = await API.get("/credit-score");
      setData(res.data);
    } catch (err) {
      console.error("Credit score fetch failed", err);
      setError(true);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  useEffect(() => { fetchScore(); }, []);

  const score = data?.score ?? 0;
  const fallback = getBand(score);
  // Backend band/color are authoritative — the local thresholds can drift.
  const band = {
    label: data?.band ?? fallback.label,
    color: data?.bandColor ?? fallback.color,
  };

  const tone = (SCORE_BANDS.find(x => x.label.toLowerCase() === String(band.label).toLowerCase()) || fallback).tone;
  return (
    <section aria-label="Credit score" className="max-w-2xl mb-8">
      <SectionHeader title="Credit score" subtitle="An estimate from your own data" />
      <div className="rounded-card bg-surface border border-line">
        <div className="p-5">
          {loading ? (
            <div className="h-16 rounded-control animate-pulse bg-surface-sunken" />
          ) : error || !data ? (
            <p className="text-small text-ink-3">Couldn't work out your score right now. Try again in a moment.</p>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <p className="text-display text-ink num">{score}<span className="text-heading text-ink-3 font-medium"> / 900</span></p>
                <Badge tone={tone}>{band.label}</Badge>
              </div>
              <ScoreGauge score={score} />
            </>
          )}
        </div>

        {data?.factors?.length > 0 && (
          <>
            <button type="button" onClick={() => setFactorsOpen(o => !o)} aria-expanded={factorsOpen}
                    className="w-full flex items-center justify-between px-5 py-3.5 border-t border-line text-left">
              <span className="text-body text-ink">What affects it</span>
              <ChevronDown size={18} aria-hidden className={`text-ink-3 transition-transform ${factorsOpen ? "rotate-180" : ""}`} />
            </button>
            {factorsOpen && (
              <ul className="divide-y divide-line border-t border-line">
                {data.factors.map(f => {
                  const pct = f.maxPoints > 0 ? (f.points / f.maxPoints) * 100 : 0;
                  const t = f.status === "good" ? "good" : f.status === "warning" ? "warn" : f.status === "poor" ? "bad" : "accent";
                  return (
                    <li key={f.label} className="px-5 py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-body text-ink">{f.label}</span>
                        <span className="text-small text-ink-3 num shrink-0">{f.points} of {f.maxPoints}</span>
                      </div>
                      <Progress className="mt-2" value={pct} tone={t} label={f.label} />
                      {f.desc && <p className="mt-2 text-small text-ink-3">{f.desc}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <div className="px-5 pt-3 pb-2 border-t border-line">
          <p className="text-caption text-ink-3">{data?.disclaimer || "Based on your last 3 months. Not a bureau score."}</p>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={fetchScore} disabled={checking} className="-ml-3 mt-1">
            {checking ? "Checking…" : "Refresh"}
          </Button>
        </div>
      </div>
    </section>
  );
}
