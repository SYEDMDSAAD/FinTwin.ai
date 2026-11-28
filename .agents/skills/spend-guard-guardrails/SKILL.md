---
name: spend-guard-guardrails
description: Payment-safety rules for FinTwin's Spend Guard, the AI agents that pause before UPI payments, decide top-ups, rebalance budgets and split the salary. Use when changing anything under guard-service/, frontend/src/components/guard/, SpendGuardPage, guardApi.js, guardMock.js or GuardController, or any code that builds UPI links, moves rupee amounts between accounts, edits the agents' prompts, or decides what data reaches the AI model.
---

# Spend Guard guardrails

Spend Guard helps people decide about real money, so mistakes are costly. The split of work is on purpose:
the **agents** make judgement calls (pause or not, how much to top up, which budget gives way), and **plain
code** decides what they may say and do. Every rule below is enforced in code. Don't move one into a prompt:
a model can ignore a prompt, but not a check.

## Money

1. **FinTwin never holds or moves money.** The user's own UPI app pays, and the user approves every
   payment there: Google Pay first, and PhonePe or Paytm only as backups the user picks when Google Pay
   didn't open (`UPI_APPS` in `format.js`, shown by `UpiAppChoice.jsx`). Every handoff goes through
   `openUpi`, which aims the link at one of those three apps (`upiAppLink`: an Android intent for the
   app's package, the app's own scheme on iPhone and iPad) and changes only the app, never the payee,
   amount or note. No other app is ever added without the user asking. A computer has no UPI app, so
   nothing is opened there (`isPhone`): the page shows the same checked link as a QR code (`PayQr.jsx`,
   drawn only for a `upi://pay?` link) for the user to scan with their phone, where they approve it. Never add code that starts a payment, stores bank or card details, or sends a UPI "collect" request
   (NPCI ended P2P collect on 1 Oct 2025).
2. **Only two kinds of UPI link exist:** the merchant's scanned QR link, passed on unchanged (only the amount
   and currency are added, when missing), and a transfer to the user's own account. Both are built in
   `guard-service/rules.py` (`handoff_link`, `self_transfer_link`). The payee only ever comes from the
   scanned QR code, or from a UPI ID the user typed: the page turns that into a plain link with only
   `pa`, `pn` and `cu` (`upiLinkFor` in `format.js`), and `parse_upi` checks it like any scanned code.
   `upiAppLink` only accepts a `upi://pay?` link and passes its query on as it is.
3. **The buffer is a hard limit.** A top-up never goes past it, whatever the agent says (`check_topup`
   clamps it). Bill money never moves.
4. **Emergency top-ups** skip the questions only within fixed limits the AI can't change: up to ₹1,500,
   twice a month, and never past the buffer (`emergency_refusal`).
5. **A salary plan adds up exactly to the salary**, and every week covers essentials (`check_plan`).

## What the AI sees

6. **A person's name, UPI ID and payment note never reach the model.** For a shop, only its name and note
   may, and only inside the `UNTRUSTED` JSON block that `prompt()` in `agents/brain.py` builds. New free
   text (like a top-up reason) goes in that block too, never into the instructions. The user's own words
   about an unknown payee go there after `clean_reason` takes out links, UPI IDs and long numbers.
7. **The user's own UPI ID never reaches the model**, and API responses show it masked (`mask_upi`).
8. **Real user data goes only to Vertex AI, or to a model on this same machine.** The free AI Studio key
   may only see the made-up persona (`GUARD_PERSONA=1`), which `availability()` in `agents/brain.py`
   enforces. A local model (`GUARD_MODEL=ollama/...`) may see real data only while `OLLAMA_URL` is a
   loopback address (`ollama_llm.is_local`); an Ollama anywhere else counts as an outside service and
   gets the persona only. If FinTwin's data can't be read, the model isn't asked at all.

## What the AI says

9. **Every agent answer is checked in code before the user sees it** (`clean_message` and the `check_*`
   functions in `rules.py`):
   - every rupee amount and percentage must appear in the FACTS, including amounts written in Indian
     languages
   - no shaming words (confirm-shaming is a banned dark pattern under the CCPA's 2023 guidelines)
   - no links or UPI IDs, and at most 240 characters
10. **The AI never holds up a payment.** Each request answers inside the backend's 20-second timeout. Scan
    and top-up get one try, because someone is waiting at the counter. The rebalancer and the payday
    planner get up to three: a rejected answer goes back to the same agent session with the reason. After
    that, or on a timeout or model error, the fixed rules in the `fallback_*` functions decide.

## When to pause

11. Essentials (groceries, health, bills, rent, transport, education) and payments under the user's
    minimum (₹100 by default) skip the AI. When FinTwin can't tell who is being paid (a person, or a payee
    nothing could place: `payee_unknown`), Spend Guard first asks what the payment is for, unless it's
    under the minimum or the money isn't there. The answer is picked from a fixed list
    (`REASON_CATEGORIES`) and mapped to a category in code, so "Rent" is an essential; the model never
    picks the category, and a made-up answer is ignored, so the question comes back.
12. **Betting (MCC 7995) always pauses**, whatever the amount: it never skips the AI, `check_scan` rejects
    a "go", and the fixed-rule fallback pauses it.
13. After 3 pauses in a day, Spend Guard stops pausing, so it never nags. Betting still pauses.
14. "Pay anyway" unlocks after a 5-second pause (`PAUSE_SECONDS` in `ScanPanel.jsx`). The user can always
    pay: Spend Guard advises, it never blocks.
15. Made-up sample shops (UPI IDs ending in `@sample`) never open a UPI app and never become a FinTwin
    transaction (`is_sample` in `rules.py` and `format.js`).

## Access

16. **Backend:** every `/api/v1/guard/**` call needs the `USE_SPEND_GUARD` permission (the USER role)
    and, while this is a prototype, a user id in `guard.allowed-users`.
    `GuardController` sets the user id and a fresh tool token itself, overwriting anything the browser sent.
    **The shared demo** gets in only with a demo token's session (`DemoSession`), on its own path: each
    visit gets its own Spend Guard id (`demoGuardId`, far above any real user id), `demo: true`, and no
    tool token, so guard-service can't read FinTwin; whatever it proposes for FinTwin (`record`,
    `goalPlan`) is dropped (`withoutLinks`); model calls are capped per visit and per day
    (`DemoGuardLimits`). In guard-service a demo visit is the made-up persona (`data.demo_visit`), kept
    in memory only (the oldest visits are dropped), and may check any code (scanned, uploaded, typed or a
    sample) against the made-up persona; no own UPI ID. After Pay: a sample shop's step is a
    preview (buttons disabled, the `@sample` QR marked "no shop behind it"), and a real code is
    handed to the visitor's own UPI app while `DEMO_REAL_HANDOFF` is on (default during judging;
    `0` gives `link: None` and "Demo: nothing is paid"). Money only moves if the visitor approves
    it with their own PIN, and nothing from a demo is ever recorded in FinTwin. The
    browser can never set `demo` itself: the backend writes it on every call.
17. **guard-service:** every path except `/` and `/health` needs the `X-Internal-Key` header, compared in
    constant time. The browser never calls guard-service directly; it always goes through the backend.
18. **Secrets** (`AI_INTERNAL_KEY`, API keys, JWT secrets, `.env*` files) come from the environment or
    Secret Manager. Never hardcode, log, print or commit them.

## Links to the rest of FinTwin

19. **guard-service proposes; the backend checks and writes.** guard-service never writes a transaction or
    a goal. It returns a `record` (a paid payment) or a `goalPlan` (an approved salary plan);
    `GuardController` takes both out of the reply and hands them to `SpendGuardLinks`, which checks every
    field before writing: the event id's shape, an amount above zero and at most ₹5,00,000, a known
    category, a month within one of now, at most 20 goal shares. One transaction per event (external id
    `GUARD:<event id>`). A bank statement row for the same money takes it over, and "I didn't pay" removes
    it only while it is still Spend Guard's.
19a. **The user can set the plan themselves** (`/guard/edit-plan`, "Set it yourself"). Their split is a
    new proposal with source `user` and goes through the same `check_plan` as the agent's (adds up to
    the salary, every week covers essentials, only their own goals); no AI is called. Approving it works
    the same way.
19b. **A payment counts only once it's confirmed.** Tapping Pay opens the UPI app and leaves the scan
    `pending`: nothing comes off the spending account and nothing is recorded. "I paid" (`/guard/confirm`)
    or the same amount turning up in FinTwin's transactions within `PENDING_DAYS` (3) of it
    (`pending_match`, settled when the wallet is read) marks it paid; "I didn't pay", or 3 days with no
    sign of it, marks it `not_paid`. A payment found in the transactions is never recorded a second time,
    and a failed read decides nothing. When "I paid" comes after the bank's SMS or alert email for the
    same money (same amount, today or yesterday, not claimed by another event), `recordPayment` claims
    that transaction (its external id becomes `GUARD:<event id>`, the QR's payee name and category
    replace the bank's text unless the user fixed them) instead of adding a second one; the bank's
    record can't be removed with "I didn't pay". Scan history lives on the Scan tab (`ScanHistory.jsx`).
19c. **The bank statement settles it, and the user has the last word.** A statement import flags a
    `SPEND_GUARD` transaction dated inside the file's date range that no row matched as
    `SPEND_GUARD_UNMATCHED` ("not in your statement"); it is never deleted on import, because the
    user may have paid from another account. The user answers in the scan history or on the
    Transactions page: "I paid" → `SPEND_GUARD_KEPT` (never asked again); "I didn't pay" →
    `/guard/undo-paid`: the money goes back to the spending account, the history says not paid, and
    the backend removes the transaction. "I paid" by mistake can be undone the same way, but only while
    the transaction is still Spend Guard's: `stillProvisional` is set by the backend, never the
    browser, and a payment a statement took over (or one found in the transactions) stays paid.
    A demo visit opens with a sample week of history (`_seed_demo`) and never touches FinTwin.
20. **Only real payments are recorded:** never a sample shop, a skipped payment, a top-up (that's the
    user's own money moving between their accounts), or anything with the made-up persona. The persona's
    goals never reach real goals.
21. **An earmark is a priority, not extra money.** Goal progress still counts only money actually saved
    (`GoalMath.allocateSavings`): each month's real net savings fill earmarked goals first, up to the
    earmark and what the goal still needs.
22. **Spend Guard's records live in FinTwin's database, encrypted** (`spend_guard_state`, the user's own
    row, deleted with their account). If FinTwin can't be read, guard-service works in memory and never
    writes over the stored records.
23. **A scanned payee's category:** the user's own correction in FinTwin first, then the QR code's
    merchant type, then FinTwin's categoriser (`choose_category`), and when none of them can place the
    payee, what the user says the payment is for (rule 11). The payee's name goes to FinTwin's
    backend for this, never to the model. Betting is decided by the merchant code, so no category can
    take a bet out of the check.
24. **The Copilot's Spend Guard figures are counts and rupees only** (`summary` in `main.py`), never a
    payee's name, UPI ID or note, and they say the wallet balances are pretend.

25. **Goal savings are protected in a rebalance.** `rebalance_sources` marks every goal `locked` unless the
    user ticked "Let goal savings give too" (`allowGoals`, stored on the event so approving uses the same
    sources). The order is this month's unlocked budgets, next week's allowance, then next month's
    everyday budgets (`next_month`: at most half of them, `NEXT_MONTH_SHARE`, spread over them in
    proportion to their size when approved), and unlocked goals last. Essentials are never cut.
26. **Approved budget moves show in FinTwin.** `summary()` carries `budgetAdjustments` (this month and
    next, categories only, never goal keys); `SpendGuardLinks.budgetAdjustments` reads them and
    `BudgetService` adds them to that month's limits, with the amount in `adjustment`. guard-service
    subtracts `adjustment` when it reads FinTwin's budgets, because the wallet adds its own moves.
27. **After "Pay anyway" goes over budget, the suggestion is ready** (`CutsCard autoSuggest` in
    `ScanPanel`): one rebalance call, and still nothing changes until the user approves.

## The limits are product decisions

The numbers above (₹1,500, twice a month, 3 pauses a day, 5 seconds, ₹100, 240 characters, 20 seconds)
were chosen on purpose. Change one only when the user asks, and update its test and this skill in the same
change.

## Before you finish

Run the checks. The script works from anywhere in the repo:

```bash
.agents/skills/spend-guard-guardrails/scripts/check.sh            # guard-service + Spend Guard frontend tests, scans
.agents/skills/spend-guard-guardrails/scripts/check.sh --backend  # also the backend guard tests (needs Docker)
```

If you changed a prompt in `agents/prompts.py` or a check in `rules.py`, also run the evals described in
`guard-service/README.md`, with the made-up persona, and keep the results file outside the repo.

To see where each rule lives and which test guards it, read `references/rule-map.md`.
