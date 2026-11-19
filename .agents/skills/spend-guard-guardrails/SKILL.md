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

1. **FinTwin never holds or moves money.** The user's own UPI app pays, and the user approves every payment
   there. Never add code that starts a payment, stores bank or card details, or sends a UPI "collect" request
   (NPCI ended P2P collect on 1 Oct 2025).
2. **Only two kinds of UPI link exist:** the merchant's scanned QR link, passed on unchanged (only the amount
   and currency are added, when missing), and a transfer to the user's own account. Both are built in
   `guard-service/rules.py` (`handoff_link`, `self_transfer_link`). The payee only ever comes from the
   scanned QR code.
3. **The buffer is a hard limit.** A top-up never goes past it, whatever the agent says (`check_topup`
   clamps it). Bill money never moves.
4. **Emergency top-ups** skip the questions only within fixed limits the AI can't change: up to ₹1,500,
   twice a month, and never past the buffer (`emergency_refusal`).
5. **A salary plan adds up exactly to the salary**, and every week covers essentials (`check_plan`).

## What the AI sees

6. **A person's name, UPI ID and payment note never reach the model.** For a shop, only its name and note
   may, and only inside the `UNTRUSTED` JSON block that `prompt()` in `agents/brain.py` builds. New free
   text (like a top-up reason) goes in that block too, never into the instructions.
7. **The user's own UPI ID never reaches the model**, and API responses show it masked (`mask_upi`).
8. **Real user data goes only to Vertex AI.** The free AI Studio key may only see the made-up persona
   (`GUARD_PERSONA=1`), which `availability()` in `agents/brain.py` enforces. If FinTwin's data can't be
   read, the model isn't asked at all.

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
    minimum (₹100 by default) skip the AI.
12. Betting (MCC 7995) never skips the AI, and the fixed-rule fallback always pauses it.
13. After 3 pauses in a day, Spend Guard stops pausing, so it never nags. Betting is still checked.
14. "Pay anyway" unlocks after a 5-second pause (`PAUSE_SECONDS` in `ScanPanel.jsx`). The user can always
    pay: Spend Guard advises, it never blocks.
15. Made-up sample shops (UPI IDs ending in `@sample`) never open a UPI app.

## Access

16. **Backend:** every `/api/v1/guard/**` call needs the `USE_SPEND_GUARD` permission (the USER role only,
    never the shared DEMO account) and, while this is a prototype, a user id in `guard.allowed-users`.
    `GuardController` sets the user id and a fresh tool token itself, overwriting anything the browser sent.
17. **guard-service:** every path except `/` and `/health` needs the `X-Internal-Key` header, compared in
    constant time. The browser never calls guard-service directly; it always goes through the backend.
18. **Secrets** (`AI_INTERNAL_KEY`, API keys, JWT secrets, `.env*` files) come from the environment or
    Secret Manager. Never hardcode, log, print or commit them.

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
