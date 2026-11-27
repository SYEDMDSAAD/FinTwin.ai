# FinTwin, investment first

**Decision (2026-11-27, after mentor and business-analyst rounds):** FinTwin is an investing app.
Spending, budgets and Spend Guard stay, but their job changes. They find the money to invest.
That link between spending and investing is the gap no other app fills.

**Limits that shape every screen.** We are not SEBI-registered and hold no AMFI ARN.
- **We can:** show facts, do maths and raise warnings, sort lists by data, and track what the user owns.
- **We can't:** say "buy this fund", suggest a mix for a person, or place an order.

Every list must say what it is sorted by. It must never say "recommended".

## What the top apps do

| App | What they do well | What we take |
|---|---|---|
| **Groww** | A portfolio card: current value, invested, total returns (₹ and %), day change. An XIRR switch: Active (current holdings) vs Lifetime. Fund page: NAV chart with 1M–All ranges, a returns calculator, expense ratio, exit load, riskometer, peers. Collections like "Index funds" and "Tax saving". SIP management. | Portfolio card, both XIRRs, fund page layout, collections as plain filters |
| **Zerodha Kite / Coin / Console** | A calm, number-first holdings table you can sort. Group by asset class, sector or tag. Red flags on holdings, top contributors to returns, a dividends view, family accounts. | Sortable holdings, grouping, "top contributors", red flags (we already have health checks) |
| **INDmoney** | One net worth across mutual funds, stocks, US stocks, FDs and EPF. Each fund's XIRR against its benchmark over several periods. Sector split. Shows a good overall XIRR hiding one lagging fund. | Fund-vs-benchmark, laggard callout, net worth as one view |
| **Kuvera / ET Money** | Regular → direct plan savings in rupees, tax-loss harvesting, goal-linked investing, overlap warnings (40–50% is high). | We already have direct-plan cost and tax harvest. Add overlap when we have holdings data. |

Groww's one gap users complain about: **no equity/debt/hybrid split** on the dashboard. We show it.

## The new map

```
Home    — investing first: portfolio value, returns, value over time, money you can
          invest this month, next SIPs, allocation, top insight; spending in a small card
Invest  — Portfolio · SIPs · Explore · Insights · Future Twin · Goals · Net worth
Spend   — Transactions · Scan & pay · Budgets · Analytics · Coach
Me      — Add data · Receipts · Reports · Insurance · Settings
```

Old section names keep working (`normaliseSection`): "Investments" opens Portfolio,
and "Goals Planner" and "Net Worth" move to Invest.

## Phases

### Phase 1: make investing the front door (this round)
1. **Navigation:** Grow becomes **Invest** and sits second. The Investments sub-tabs become real sections. Insurance moves to Me.
2. **Home, investment first.** Applies to the phone too, because it's a product change, not a website polish.
   - Portfolio value, total returns, XIRR, and a value-over-time chart.
   - **"You can invest this month"**: money in − money out − SIPs already running. This is maths, not advice.
   - Next SIP dates, an allocation split (equity / debt / gold / cash), and the top portfolio-health insight.
   - The spending summary shrinks to one card (left this month and Spend Guard savings).
3. **Portfolio page, like Groww and Kite:**
   - a summary card, Active/Lifetime XIRR, an allocation donut by asset class;
   - holdings you can sort (value, returns, XIRR) and group (type, source);
   - "Top contributors" (biggest gain and biggest drag);
   - a two-column layout on wide screens.
4. **Landing page:** the story becomes investing. "Spend less where it doesn't matter. Invest it where it does." The hero shows the portfolio; Spend Guard becomes "Pause → Invest".

### Phase 2: explore and fund pages
- Search, then a fund page with:
  - a NAV chart with 1M/6M/1Y/3Y/5Y/All ranges;
  - a SIP and lump-sum returns calculator on past NAVs;
  - facts: category, expense ratio, plan (direct/regular), and the fund's age from its NAV history;
  - "You hold this" with your lots and XIRR.
- Collections as plain filters: Index funds, ELSS (tax saving), Large / Mid / Small cap, Debt, Gold. Each is sorted by a stated column (cost, 3-year return) and labelled "not a recommendation".
- Watchlist merged into one list (funds and stocks).

### Phase 3: insights
- Each fund against its category benchmark (an index fund as the yardstick) over 1, 3 and 5 years, and a callout for a laggard.
- Regular → direct cost in rupees per year (we have the % today).
- Overlap and sector split once we can read fund holdings (AMFI monthly portfolio disclosures).
- SIP calendar: missed, upcoming, and the step-up nudge (we already have it).

### Phase 4: spending → investing loop (our edge)
- Pause → Invest: a skipped buy shows "₹2,400 at your SIP's past return is ₹X in 5 years", with "Add to my SIP plan" (a note, money never moves).
- Round-ups and wishlist money roll into a monthly "invest pot" shown on Home.
- The salary-day plan puts SIPs first, before the allowance (guard-service already counts SIPs).

### Then the items already agreed
- **Half-built features:** AI preferences stored on the server and used by the Copilot, the daily recap shown when "daily insights" is on, Copilot answers about unusual spending, manual goal top-ups, dead pages removed.
- **Security and cleanup:**
  - unverified sign-up cleanup;
  - a Content-Security-Policy;
  - Secret Manager;
  - a narrow Cloud Run service account (needs an OK for the IAM change).
- **Play Store readiness:** release signing, icon and splash, data-safety answers, listing text. The user creates the Play Console account and uploads.

### Needs a licence (not in these phases)
- Buying through FinTwin: an AMFI ARN (NISM V-A) with a distributor partner, or SEBI RIA for advice.
- Account Aggregator: an FIU licence (see the AA cost note).

## Rules for every screen
- Lead with one number. Rupees and percentages use tabular digits. Green and red are only for gains and losses.
- Show every period it covers ("1Y", "since you started"). XIRR is not shown for anything held under 365 days (AMFI rule; already in `HoldingReturns`).
- Empty state = one action: "Import your CAS" (we already parse CAMS, KFintech, NSDL and CDSL).
- The made-up demo data must have investments, so the demo shows all of this.

## Phase 2 build spec: how each asset type is shown (from Groww, Kite, INDmoney)

Portfolio holdings are grouped by type, each with its own row and detail page:

| Type | Holdings row | Detail page |
|---|---|---|
| **Stocks** (Kite/Groww) | qty · avg price · LTP · value · P&L ₹/% · day change | price chart 1D/1W/1M/1Y/5Y, 52-week high/low, your lots, XIRR (≥365 days) |
| **Mutual funds** (Groww/Coin) | invested · current · returns · XIRR · units · NAV date | NAV chart 1M/6M/1Y/3Y/5Y/All, SIP and lump-sum calculator on past NAVs, category, direct/regular, fund age, 1/3/5-yr returns, "you hold this" |
| **FDs** (INDmoney/Groww FD) | principal · rate · maturity date · interest so far · days left | maturity amount (quarterly compounding), a timeline from start to maturity, TDS note |
| **IPOs** (Groww) | status chip: Applied / Allotted / Listed | timeline: open → close → allotment → listing; price band, lot size, minimum investment; listing gain once listed |
| **Gold / PPF / NPS** | value · invested · rate where known | simple facts card |

**Backend work (all data sources already exist):**
- ai-service `market/routes.py`: add `GET /discover/funds/{code}/history?range=` (reuse `_nav_history`) and `GET /discover/stocks/{symbol}/history?range=` (yfinance), plus `GET /discover/funds/collection/{name}`, filtering the AMFI category (Index, ELSS, Large/Mid/Small cap, Debt, Gold), Direct plans only, sorted by 3-year return and labelled "not a recommendation".
- backend `DiscoverService` and `DiscoverController`: proxy those three, following the pattern of `fund(code)`.
- The Investment model already has `units`, `interestRate`, `purchaseDate`, `ipoStatus` and `ipoListingId`, so no migration is needed for FD or IPO display.

**Frontend:**
- `components/invest/FundPage.jsx`, `StockPage.jsx`, `FdCard.jsx`, `IpoTimeline.jsx`.
- PortfolioTab groups holdings by type, and a tap opens the detail page.
- Explore: collections row plus one merged watchlist.

## Status (2026-11-28)

- **Phase 1 — done.** Invest tab, investing-first Home, Portfolio page, landing page.
- **Phase 2 — done.**
  - Holdings are grouped by type with subtotals, and tapping one opens its own page (`components/invest/`):
    - **fund:** NAV chart 1M–All, past returns, a SIP / one-time calculator on real NAVs, facts, your units;
    - **stock:** chart 1D–5Y, 52-week range, quantity, average price, today's P&L;
    - **FD / PPF:** interest so far, growth at this rate;
    - **IPO:** status, timeline, price band, lot, minimum;
    - anything else gets a facts page.
  - Explore opens on **Collections**: 8 AMFI-category filters, direct plans with the growth option, sorted by 3-year return, each with its "not a recommendation" note.
  - New endpoints: `/discover/funds/{code}/history|navs`, `/discover/stocks/history`, `/discover/funds/collections[/{key}]`.
  - The demo's funds carry real scheme codes.
- **Phase 3:**
  - **Done:** "Your funds against the index" on Insights. Each equity fund is compared with the index fund for its market (Nifty 50 / Midcap 150 / Smallcap 250) over the longest shared period, with a callout for a laggard 2 or more points behind.
  - **Already existed:** the regular-plan cost in rupees.
  - **Still open:** overlap and sector split (needs AMFI portfolio disclosures).
- **Phase 4:**
  - **Done:** a skipped buy shows that money invested at 8/10/12% and at the user's own XIRR. Home's Spend Guard card shows "saved by pausing" grown over 10 years. Both link to Future Twin.
  - **Still open:** the invest pot from round-ups and wishlist money, and SIPs first in the payday plan.
- **Bug fixed along the way:** a 404 for a signed-in user came back as a 401 (the error dispatch had no JWT), which signed people out. `/error` is now permitted, with `MissingPathIntegrationTest`.
