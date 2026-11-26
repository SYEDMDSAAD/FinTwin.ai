import { useState } from "react";
import FillFromPdf from "../components/FillFromPdf";
import { TrendingUp, Plus, Pencil, Trash2, Check, Info, Home, Car, Gem, Landmark, Briefcase, GraduationCap, CreditCard, ChevronRight, ChevronDown, PiggyBank } from "lucide-react";
import { Button, SectionHeader, IconChip, cx } from "../components/ui";
import { rupees } from "../utils/money";

// Asset types that belong in the Investment Portfolio page, not allowed here
const INVESTMENT_TYPES = new Set([
  "stocks", "stock", "mutual fund", "mutual funds", "mf",
  "fixed deposit", "fd", "gold", "ppf", "nps", "bonds", "bond",
  "crypto", "cryptocurrency", "investment", "investments",
]);

const isInvestmentType = (type) =>
  type ? INVESTMENT_TYPES.has(type.toLowerCase().trim()) : false;

// Allowed asset types for this page. "Savings Account" / "Emergency Fund" are
// deliberately absent: assets with those types counted toward Total Assets
// while the Savings card ignored them, so the page contradicted itself.
// Cash savings belong to the Savings figure, not this list.
const ASSET_TYPES = [
  "Real Estate",
  "Property",
  "Vehicle",
  "Jewellery",
  "Fixed Assets",
  "Provident Fund",
  "Other",
];

const LIABILITY_TYPES = [
  "Home Loan",
  "Car Loan",
  "Personal Loan",
  "Student Loan",
  "Credit Card",
  "Business Loan",
  "Medical Debt",
  "Other",
];

const gotoSection = (name) => {
  localStorage.setItem("activeSection", name);
  window.dispatchEvent(new Event("dashboardNav"));
};

// Weighs a single liability against the user's savings and, when no
// structured repayment plan (EMI + term) has been recorded, advises whether
// it is small enough relative to savings to clear outright versus large
// enough that it warrants a formal, tracked repayment schedule.
const PAYOFF_THRESHOLD_PCT = 35;

function getLiabilityInsight(liability, savings) {
  const amount = liability?.amount || 0;
  const hasEmi  = Boolean(liability?.emi);
  const hasTerm = Boolean(liability?.termMonths);

  if (!savings || savings <= 0) {
    return {
      tone: "neutral",
      headline: "No positive savings to compare against",
      message:
        "Your savings figure isn't positive right now, either no balance is on record or recent spending exceeded income, so this liability can't be weighed against it. Once your savings turn positive, a personalised repayment recommendation appears here.",
    };
  }

  const pct = (amount / savings) * 100;
  const pctLabel = pct < 1 ? "under 1%" : `${Math.round(pct)}%`;

  if (hasEmi && hasTerm) {
    return {
      tone: "info",
      pct,
      headline: `EMI plan in place, ${pctLabel} of savings`,
      message: `This liability equals ${pctLabel} of your total savings. You've already set up a monthly EMI of ₹${liability.emi.toLocaleString("en-IN")} over ${liability.termMonths} months, so continue following that repayment schedule, it's the most cost-effective way to retire this debt.`,
    };
  }

  if (hasEmi && !hasTerm) {
    return {
      tone: "info",
      pct,
      headline: `Add the remaining term, ${pctLabel} of savings`,
      message: `This liability equals ${pctLabel} of your total savings. You've set a monthly EMI of ₹${liability.emi.toLocaleString("en-IN")}, but no repayment term is on record. Add the remaining months so we can confirm your full payoff timeline and total interest outlay.`,
    };
  }

  if (!hasEmi && hasTerm) {
    return {
      tone: "info",
      pct,
      headline: `Add the EMI amount, ${pctLabel} of savings`,
      message: `This liability equals ${pctLabel} of your total savings. You've recorded a repayment term of ${liability.termMonths} months, but no monthly EMI amount. Add the EMI so we can confirm this liability is on track to be fully repaid within that window.`,
    };
  }

  if (pct < PAYOFF_THRESHOLD_PCT) {
    return {
      tone: "good",
      pct,
      headline: `Manageable, ${pctLabel} of savings, consider clearing early`,
      message: `This liability equals only ${pctLabel} of your total savings, a manageable share. Since no EMI or repayment term is set, we recommend paying it off in full as early as you comfortably can. Clearing it now will save you from accumulating avoidable interest and will immediately strengthen your net worth.`,
    };
  }

  return {
    tone: "warning",
    pct,
    headline: `Large, ${pctLabel} of savings, set up an EMI plan`,
    message: `This liability equals ${pctLabel} of your total savings, a substantial share that isn't advisable to clear in one go. Rather than draining your savings, set up a monthly EMI with a defined repayment term. A structured plan protects your emergency buffer while steadily reducing the debt.`,
  };
}

function NetWorthManagement({
  netWorth, assets = [], liabilities = [],
  createAsset, updateAsset, deleteAsset,
  createLiability, updateLiability, deleteLiability,
}) {
  const [assetName,   setAssetName]   = useState("");
  const [assetAmount, setAssetAmount] = useState("");
  const [assetType,   setAssetType]   = useState(ASSET_TYPES[0]);
  const [liabilityName,   setLiabilityName]   = useState("");
  const [liabilityAmount, setLiabilityAmount] = useState("");
  const [liabilityType,   setLiabilityType]   = useState(LIABILITY_TYPES[0]);
  // Optional loan details, providing an EMI activates the payment-based
  // debt-to-income assessment in the credit score.
  const [liabilityEmi,    setLiabilityEmi]    = useState("");
  const [liabilityRate,   setLiabilityRate]   = useState("");
  const [liabilityTerm,   setLiabilityTerm]   = useState("");
  const [editingAssetId,     setEditingAssetId]     = useState(null);
  const [editingLiabilityId, setEditingLiabilityId] = useState(null);
  const [editName,   setEditName]   = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editType,   setEditType]   = useState("");
  const [editEmi,    setEditEmi]    = useState("");
  const [editRate,   setEditRate]   = useState("");
  const [editTerm,   setEditTerm]   = useState("");
  const [addingAsset,     setAddingAsset]     = useState(false);
  const [addingLiability, setAddingLiability] = useState(false);
  const [openInsightId,   setOpenInsightId]   = useState(null);

  // The asset and liability editors share the edit* fields, so opening one
  // must close the other, with both open they typed into each other.
  const startAssetEdit = (asset) => {
    setEditingLiabilityId(null);
    setEditingAssetId(asset.id);
    setEditName(asset.name); setEditAmount(asset.amount); setEditType(asset.type);
  };
  const startLiabilityEdit = (liability) => {
    setEditingAssetId(null);
    setEditingLiabilityId(liability.id);
    setEditName(liability.name); setEditAmount(liability.amount); setEditType(liability.type);
    setEditEmi(liability.emi ?? ""); setEditRate(liability.interestRate ?? ""); setEditTerm(liability.termMonths ?? "");
  };

  const isHealthy      = (netWorth?.netWorth || 0) >= 0;
  const totalAssets    = netWorth?.totalAssets || 0;
  const totalLiabilities = netWorth?.totalLiabilities || 0;
  const savings        = netWorth?.savings || 0;
  const portfolioValue = netWorth?.portfolioCurrentValue || 0;
  const portfolioPnl   = netWorth?.portfolioPnl || 0;
  const portfolioCount = netWorth?.portfolioCount || 0;
  const totalWealth    = totalAssets + portfolioValue + (netWorth?.savings || 0);
  // Clamped: negative savings can drag totalWealth below zero, and a raw
  // negative percentage renders as an invalid bar width.
  const assetPct       = totalWealth + totalLiabilities > 0
    ? Math.min(100, Math.max(0, Math.round((totalWealth / (totalWealth + totalLiabilities)) * 100))) : 0;

  // Only show non-investment, non-savings assets in this list
  const displayAssets = assets.filter(
    (a) => a.type !== "ManualSavings" && !isInvestmentType(a.type)
  );

  // If user has legacy investment-type assets in the DB, collect them for info
  const legacyInvestmentAssets = assets.filter(
    (a) => a.type !== "ManualSavings" && isInvestmentType(a.type)
  );

  const assetIcon = (type) => {
    const t = (type || "").toLowerCase();
    if (t.includes("real") || t.includes("property")) return Home;
    if (t.includes("vehicle") || t.includes("car")) return Car;
    if (t.includes("jewel")) return Gem;
    if (t.includes("provident")) return Landmark;
    return Briefcase;
  };
  const liabilityIcon = (type) => {
    const t = (type || "").toLowerCase();
    if (t.includes("home") || t.includes("mortgage")) return Home;
    if (t.includes("car")) return Car;
    if (t.includes("student")) return GraduationCap;
    return CreditCard;
  };
  const INSIGHT_TONE = { good: "text-good", warning: "text-warn", info: "text-info", neutral: "text-ink-3" };
  const net = netWorth?.netWorth || 0;

  return (
    <div className="max-w-2xl mb-8">
      {/* The number */}
      <section aria-label="Net worth" className="px-1 mb-8">
        <p className="text-small text-ink-3">Net worth</p>
        <p className={cx("text-hero num mt-1", isHealthy ? "text-ink" : "text-bad")}>{rupees(net)}</p>
        <p className="mt-2 text-body text-ink-2">What you own minus what you owe</p>
        <div className="mt-5 flex h-2 gap-0.5 rounded-full overflow-hidden" aria-label={`${assetPct}% of the total is what you own`} role="img">
          <div className="bg-good" style={{ width: `${assetPct}%` }} />
          <div className="bg-bad flex-1" style={{ opacity: totalLiabilities > 0 ? 1 : 0 }} />
        </div>
      </section>

      <ul className="mb-8 rounded-card bg-surface border border-line divide-y divide-line">
        {[
          { label: "Savings", note: "Money in your accounts", value: savings, icon: PiggyBank },
          { label: "Investments", note: portfolioCount ? `${portfolioCount} holding${portfolioCount !== 1 ? "s" : ""} · ${portfolioPnl >= 0 ? "up" : "down"} ${rupees(Math.abs(portfolioPnl))}` : "None added yet", value: portfolioValue, icon: TrendingUp, go: "Investments" },
          { label: "Other assets", note: "Property, vehicles, gold…", value: totalAssets, icon: Home },
          { label: "Owed", note: "Loans and cards", value: -totalLiabilities, icon: CreditCard },
        ].map(r => (
          <li key={r.label}>
            <button type="button" disabled={!r.go} onClick={() => r.go && gotoSection(r.go)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left disabled:cursor-default enabled:hover:bg-surface-hover">
              <IconChip icon={r.icon} />
              <span className="min-w-0 flex-1">
                <span className="block text-body text-ink">{r.label}</span>
                <span className="block text-small text-ink-3">{r.note}</span>
              </span>
              <span className={cx("text-body font-semibold num", r.value < 0 ? "text-bad" : "text-ink")}>{rupees(r.value)}</span>
              {r.go && <ChevronRight size={16} aria-hidden className="text-ink-3 -mr-1" />}
            </button>
          </li>
        ))}
      </ul>

      {legacyInvestmentAssets.length > 0 && (
        <div className="mb-8 flex gap-3 p-4 rounded-card bg-warn-soft">
          <Info size={18} aria-hidden className="shrink-0 mt-0.5 text-warn" />
          <div className="min-w-0">
            <p className="text-body font-medium text-ink">
              {legacyInvestmentAssets.length} investment{legacyInvestmentAssets.length > 1 ? "s" : ""} saved as assets
            </p>
            <p className="text-small text-ink-2 mt-0.5">
              {legacyInvestmentAssets.map(a => a.name).join(", ")} {legacyInvestmentAssets.length > 1 ? "aren't" : "isn't"} counted here,
              so nothing is counted twice. Add {legacyInvestmentAssets.length > 1 ? "them" : "it"} under Investments to track the value.
            </p>
            <Button size="sm" variant="ghost" className="-ml-3 mt-1" onClick={() => gotoSection("Investments")}>Go to Investments</Button>
          </div>
        </div>
      )}

      {/* What you own */}
      <section aria-label="Assets" className="mb-8">
        <SectionHeader title="What you own"
          action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setAddingAsset(!addingAsset)}>Add</Button>} />

        {addingAsset && (
          <div className="mb-3 p-4 rounded-card bg-surface border border-line space-y-3">
            <p className="text-small text-ink-3">
              Stocks, funds, gold, FDs, PPF or crypto go under{" "}
              <button type="button" className="text-accent font-medium" onClick={() => gotoSection("Investments")}>Investments</button>, which tracks their prices.
            </p>
            <input className={INPUT} placeholder="Name, like Home" aria-label="Asset name" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className={INPUT} type="number" inputMode="numeric" placeholder="Worth ₹" aria-label="Worth" value={assetAmount} onChange={(e) => setAssetAmount(e.target.value)} />
              <select className={INPUT} aria-label="Type" value={assetType} onChange={(e) => setAssetType(e.target.value)}>
                {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={!assetName.trim() || !(Number(assetAmount) > 0)}
                onClick={async () => {
                  await createAsset({ name: assetName, amount: Number(assetAmount), type: assetType });
                  setAssetName(""); setAssetAmount(""); setAssetType(ASSET_TYPES[0]); setAddingAsset(false);
                }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingAsset(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <ul className="rounded-card bg-surface border border-line divide-y divide-line">
          {displayAssets.length === 0 && legacyInvestmentAssets.length === 0 && (
            <li className="px-4 py-4 text-small text-ink-3">Nothing added. Property, vehicles and jewellery go here.</li>
          )}
          {displayAssets.map((asset) => (
            <li key={asset.id} className="px-4 py-3">
              {editingAssetId === asset.id ? (
                <div className="space-y-2">
                  <input className={INPUT} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" aria-label="Name" />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={INPUT} type="number" inputMode="numeric" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="Worth ₹" aria-label="Worth" />
                    {/* Old rows may carry a retired type: keep it selectable so editing doesn't silently switch it */}
                    <select className={INPUT} aria-label="Type" value={editType} onChange={(e) => setEditType(e.target.value)}>
                      {(ASSET_TYPES.includes(editType) ? ASSET_TYPES : [editType, ...ASSET_TYPES]).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!String(editName).trim() || !(Number(editAmount) > 0)}
                      onClick={async () => { await updateAsset(asset.id, { name: editName, amount: Number(editAmount), type: editType }); setEditingAssetId(null); }}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingAssetId(null)}>Cancel</Button>
                    <Button size="sm" variant="ghost" icon={Trash2} className="text-bad ml-auto" onClick={() => deleteAsset(asset.id)}>Delete</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <IconChip icon={assetIcon(asset.type)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-ink truncate">{asset.name}</span>
                    <span className="block text-small text-ink-3">{asset.type}</span>
                  </span>
                  <span className="text-body font-semibold text-ink num">{rupees(asset.amount)}</span>
                  <button type="button" aria-label={`Edit ${asset.name}`} onClick={() => startAssetEdit(asset)}
                          className="shrink-0 -mr-1.5 w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-sunken">
                    <Pencil size={15} aria-hidden />
                  </button>
                </div>
              )}
            </li>
          ))}
          {legacyInvestmentAssets.map((asset) => (
            <li key={asset.id} className="flex items-center gap-3 px-4 py-3 opacity-70">
              <IconChip icon={TrendingUp} tone="warn" />
              <span className="min-w-0 flex-1">
                <span className="block text-body text-ink-2 truncate">{asset.name}</span>
                <span className="block text-small text-ink-3">{asset.type} · not counted</span>
              </span>
              <span className="text-body text-ink-3 num line-through">{rupees(asset.amount)}</span>
              <button type="button" aria-label={`Delete ${asset.name}`} onClick={() => deleteAsset(asset.id)}
                      className="shrink-0 -mr-1.5 w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-sunken">
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* What you owe */}
      <section aria-label="Liabilities">
        <SectionHeader title="What you owe"
          action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setAddingLiability(!addingLiability)}>Add</Button>} />

        {addingLiability && (
          <div className="mb-3 p-4 rounded-card bg-surface border border-line space-y-3">
            <FillFromPdf kind="loan" onFields={(f) => {
              if (f.name) setLiabilityName(f.name);
              if (f.amount != null) setLiabilityAmount(String(Math.round(f.amount)));
              if (f.type && LIABILITY_TYPES.includes(f.type)) setLiabilityType(f.type);
              if (f.emi != null) setLiabilityEmi(String(Math.round(f.emi)));
              if (f.interestRate != null) setLiabilityRate(String(f.interestRate));
              if (f.termMonths != null) setLiabilityTerm(String(f.termMonths));
            }} />
            <input className={INPUT} placeholder="Name, like Home loan" aria-label="Loan name" value={liabilityName} onChange={(e) => setLiabilityName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className={INPUT} type="number" inputMode="numeric" placeholder="Owed ₹" aria-label="Amount owed" value={liabilityAmount} onChange={(e) => setLiabilityAmount(e.target.value)} />
              <select className={INPUT} aria-label="Type" value={liabilityType} onChange={(e) => setLiabilityType(e.target.value)}>
                {LIABILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className={INPUT} type="number" inputMode="numeric" placeholder="EMI ₹ (optional)" aria-label="Monthly EMI" value={liabilityEmi} onChange={(e) => setLiabilityEmi(e.target.value)} />
              <input className={INPUT} type="number" inputMode="decimal" placeholder="Rate % (optional)" aria-label="Interest rate" value={liabilityRate} onChange={(e) => setLiabilityRate(e.target.value)} />
              <input className={cx(INPUT, "col-span-2")} type="number" inputMode="numeric" placeholder="Months left (optional)" aria-label="Months left" value={liabilityTerm} onChange={(e) => setLiabilityTerm(e.target.value)} />
            </div>
            <p className="text-small text-ink-3">With the EMI, FinTwin weighs your debt the way lenders do: monthly payments against monthly income.</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={!liabilityName.trim() || !(Number(liabilityAmount) > 0)}
                onClick={async () => {
                  await createLiability({
                    name: liabilityName,
                    amount: Number(liabilityAmount),
                    type: liabilityType,
                    emi: liabilityEmi ? Number(liabilityEmi) : null,
                    interestRate: liabilityRate ? Number(liabilityRate) : null,
                    termMonths: liabilityTerm ? Number(liabilityTerm) : null,
                  });
                  setLiabilityName(""); setLiabilityAmount(""); setLiabilityType(LIABILITY_TYPES[0]);
                  setLiabilityEmi(""); setLiabilityRate(""); setLiabilityTerm("");
                  setAddingLiability(false);
                }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingLiability(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <ul className="rounded-card bg-surface border border-line divide-y divide-line">
          {liabilities.length === 0 && (
            <li className="px-4 py-4 text-small text-ink-3">No loans or card balances. If you have one, adding its EMI sharpens your credit score estimate.</li>
          )}
          {liabilities.map((liability) => {
            const insight = getLiabilityInsight(liability, savings);
            const expanded = openInsightId === liability.id;
            return (
              <li key={liability.id} className="px-4 py-3">
                {editingLiabilityId === liability.id ? (
                  <div className="space-y-2">
                    <input className={INPUT} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" aria-label="Name" />
                    <div className="grid grid-cols-2 gap-2">
                      <input className={INPUT} type="number" inputMode="numeric" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="Owed ₹" aria-label="Amount owed" />
                      <select className={INPUT} aria-label="Type" value={editType} onChange={(e) => setEditType(e.target.value)}>
                        {LIABILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input className={INPUT} type="number" inputMode="numeric" value={editEmi} onChange={(e) => setEditEmi(e.target.value)} placeholder="EMI ₹" aria-label="Monthly EMI" />
                      <input className={INPUT} type="number" inputMode="decimal" value={editRate} onChange={(e) => setEditRate(e.target.value)} placeholder="Rate %" aria-label="Interest rate" />
                      <input className={cx(INPUT, "col-span-2")} type="number" inputMode="numeric" value={editTerm} onChange={(e) => setEditTerm(e.target.value)} placeholder="Months left" aria-label="Months left" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!String(editName).trim() || !(Number(editAmount) > 0)}
                        onClick={async () => {
                          await updateLiability(liability.id, {
                            name: editName, amount: Number(editAmount), type: editType,
                            emi: editEmi ? Number(editEmi) : null,
                            interestRate: editRate ? Number(editRate) : null,
                            termMonths: editTerm ? Number(editTerm) : null,
                          });
                          setEditingLiabilityId(null);
                        }}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingLiabilityId(null)}>Cancel</Button>
                      <Button size="sm" variant="ghost" icon={Trash2} className="text-bad ml-auto" onClick={() => deleteLiability(liability.id)}>Delete</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <IconChip icon={liabilityIcon(liability.type)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body text-ink truncate">{liability.name}</span>
                        <span className="block text-small text-ink-3">
                          {liability.type}{liability.emi ? ` · ${rupees(liability.emi)} EMI` : ""}
                        </span>
                      </span>
                      <span className="text-body font-semibold text-ink num">{rupees(liability.amount)}</span>
                      <button type="button" aria-label={`Edit ${liability.name}`} onClick={() => startLiabilityEdit(liability)}
                              className="shrink-0 -mr-1.5 w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-sunken">
                        <Pencil size={15} aria-hidden />
                      </button>
                    </div>
                    <button type="button" onClick={() => setOpenInsightId(expanded ? null : liability.id)} aria-expanded={expanded}
                            className="mt-2 ml-[52px] flex items-start gap-1.5 text-left text-small">
                      <Info size={14} aria-hidden className={cx("shrink-0 mt-0.5", INSIGHT_TONE[insight.tone])} />
                      <span className={INSIGHT_TONE[insight.tone]}>{insight.headline}</span>
                      <ChevronDown size={14} aria-hidden className={cx("shrink-0 mt-0.5 text-ink-3 transition-transform", expanded && "rotate-180")} />
                    </button>
                    {expanded && <p className="mt-1.5 ml-[52px] text-small text-ink-2">{insight.message}</p>}
                    <div className="mt-2 ml-[52px]">
                      <Button size="sm" variant="secondary" icon={Check} onClick={() => deleteLiability(liability.id)}
                              title="Mark as paid off and remove it">Paid off</Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

const INPUT = "w-full min-w-0 h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

export default NetWorthManagement;
