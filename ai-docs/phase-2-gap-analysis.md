# Phase 2: gap analysis of FinTwin's AI system

Written 2026-09-26. Builds on `phase-1-ai-features-walkthrough.md`: read that
first for how each feature works.

**Bottom line:** FinTwin's AI layer is well built for a 3B model on a CPU. Its
guardrails, fallbacks and feedback loops are ahead of most beta products. The
gaps are in four places: **resilience at the edges** (one circuit breaker that
never fires, mismatched timeouts, no admission control), **one feature with
almost no guardrails** (investment recommendations), **security of the internal
data API on App Service**, and **the practices a paid hosted model needs**
(evals, token budgets, a provider switch, streaming). None of them block the
beta, and the first five are small fixes.

Every finding marked **Verified** was confirmed by running code or a test during
this analysis. The others are read from the code with file references.

**Status (2026-09-26): all five P0 gaps are fixed**, each with tests:

| Gap | Fix | Proof |
|---|---|---|
| G1 | Breaker moved to `OllamaAIProvider.chatWithTrace()` with its own `ai-chat` instance; no fallback, so an open breaker fails fast into the controller's friendly 503 | `AiChatCircuitBreakerIntegrationTest`: opens after repeated failures, blocked calls never reach the AI service, the forecast's breaker stays closed |
| G2 | Constant-time key check, plus a per-request **tool token** (`AiToolToken`): minted by the backend for the user being answered, 5-minute expiry, signed with a key derived from `JWT_SECRET` that the AI service never holds | `AiToolTokenTest`, `InternalAIAccessIntegrationTest` (key alone → 403, another user's token → 403), `CopilotToolTokenRoundTripIntegrationTest` (real HTTP loop: with token 200, without 403) |
| G3 | Rules choose every allocation by asset class; portfolio score computed; the model writes only a grounded 2-sentence summary, rejected if it names a product; backend fallback no longer says "guaranteed" | 12 new/rewritten tests in `test_investment_engine.py` |
| G4 | Weekly report and investment summary calls time out at 15 s | `test_report_call_finishes_inside_the_backend_deadline`, `test_summary_call_finishes_inside_the_backend_deadline` |
| G5 | User-facing fallback says what to do, never mentions Ollama | `test_ollama_down_returns_canned_fallback` |

**Phase 3 (2026-09-26):** G7 (copilot eval, qwen baseline 63%) and G11
(per-user daily token cap) are done; G19 (evals in CI) waits for Bedrock
credentials. The eval added **G25**: `get_transactions` has no merchant
filter. See `phase-3-evals-and-provider-switch.md`.

---

## 1. What's already good (keep all of this through the Bedrock move)

Worth knowing so it doesn't get "simplified away" later:

| Strength | Where | Why it matters |
|---|---|---|
| **Compute in code, narrate with the model** | Coach, goal planner, report, investments | Numbers are right even when the model is wrong |
| **Grounding check** | `utils/grounding.py` | Catches invented amounts, invented percentages, and real figures pinned to the wrong merchant |
| **Deterministic routing** | Copilot: affordability, portfolio direct | The most reliable model call is the one you don't make |
| **A fallback for every AI output** | Every feature | An Ollama outage never breaks a page (**verified**: copilot returns a friendly 503 in ~1 s with the AI service down) |
| **Provenance labels** | `coachMessageSource`, report `degraded` | Code-written text is never passed off as AI-written |
| **The model never chooses whose data it reads** | `tools.execute_tool(name, args, user_id)`: `user_id` comes from the backend, never from the model | Prompt injection can't make the copilot read another user's data |
| **Privacy minimisation** | Category suggestions send names only, digits stripped | The least data needed leaves the backend |
| **Traces + user feedback per answer** | `chat_history.trace`, `copilot_feedback` | Bad answers can be traced to the path and tools behind them |
| **Offline evals against the live model** | `ai-service/evals/` (coach, goal planner) | Measures real model behaviour, not mocks |
| **Token accounting, per feature and per user** | `utils/metrics.py`, `ai_token_usage`, AI Usage tab | Becomes cost tracking on Bedrock |
| **Prompt versioning** | `PROMPT_VERSION` in coach and goal planner | Quality shifts can be tied to the prompt change that caused them |
| **Request rate limits on AI endpoints** | `RateLimitFilter.java:201`: 20/min per IP, 30/min per user on chat and coach | Stops a single client from flooding the model |

---

## 2. The gaps, ranked

**Priority** combines impact and effort:
- **P0**: real risk, small fix, do now.
- **P1**: important for quality or reliability.
- **P2**: efficiency and observability.
- **P3**: cleanup.

**Phase** says where each gap fits in your plan:
- **4** = model-independent optimisation (any model benefits).
- **3** = part of the eval + provider switch.
- **6** = only matters on Claude.

### P0: do now (all small)

#### G1. The copilot's circuit breaker never engages (**Verified**)

- **Where:** `backend/.../service/ChatService.java:83` calls its own
  `callAiProvider()`, which carries `@CircuitBreaker`.
- **Why it's broken:** Spring applies `@CircuitBreaker` through a proxy that wraps
  the bean. A method calling *another method on the same object* skips the
  proxy, so the annotation does nothing.
- **Evidence:** a probe test with the AI service unreachable made 7 copilot calls.
  All 7 failed, and the breaker recorded **0 calls, 0 failures**, state `CLOSED`.
  With the configured window (5 calls, 60% failure rate) it should have opened
  after the 3rd.
- **Impact:** during a *hang* (Ollama stuck, not down), every user waits the full
  90 s instead of failing fast after a few timeouts, and the waiting requests tie
  up backend threads. The forecast's breaker works, because it's called from
  another bean.
- **Fix:** move the annotation to `OllamaAIProvider.chatWithTrace()`, which is
  called from `ChatService` across the proxy. Add a test that the breaker opens.
  *Phase 4.*

#### G2. The internal data API is public on App Service, behind one key

- **Where:** `/internal/ai/**` in `InternalAIController`, `permitAll` in
  `SecurityConfig`, protected only by `X-Internal-Key`.
- **Impact:** on the VM it was unreachable from outside. On App Service,
  `fintwin-api` has a public URL, so anyone with `AI_INTERNAL_KEY` can read
  **any user's transactions, budgets, goals, net worth and portfolio by user ID**.
  It's the most valuable secret in the system. The key comparison also uses
  `String.equals` (`InternalAIController.java:469`), which isn't constant-time
  (ai-service does it correctly with `hmac.compare_digest`).
- **Fix:**
  1. Use `MessageDigest.isEqual` for the comparison (1 line).
  2. Add an App Service **access restriction** so `/internal/ai/**` only accepts
     `fintwin-ai`'s outbound IPs (no VNet cost). Once the copilot moves to
     Bedrock, the tool calls can run inside the backend instead (see Phase 3).

  *Phase 4.*

#### G3. Investment recommendations have almost no guardrails

- **Where:** `ai-service/investments/recommendation_engine.py`.
- **Issues:**
  - No grounding check on the summary. Its prompt even asks for *"one concrete
    action with a specific rupee amount"*.
  - The model invents `expectedReturn` and `portfolioScore`.
  - It is told to **name 4–5 instruments** (index funds, gold ETF…), while every
    other feature forbids product recommendations. For an Indian finance app,
    naming instruments with expected returns is close to investment advice under
    **SEBI (Investment Advisers) Regulations**, which is a compliance question
    for you before launch.
- **Fix:**
  - Compute the allocation by rules (the rule tree already covers the risky
    cases; extend it to Moderate and Aggressive).
  - Describe asset **classes** (equity, debt, gold, cash), not instruments.
  - Have the model only explain, grounded like the coach.
  - Add the "not financial advice" caveat in code, as the copilot does.

  *Phase 4.*

#### G4. Two features wait longer than their caller

- **Where:** the weekly report (`report_generator.py:336`) and investments
  (`recommendation_engine.py:134`, `:233`) call `ask()` with no timeout, so the
  default is **120 s**. The backend gives up at **20 s**.
- **Impact:** up to 100 s of CPU spent on answers nobody reads, while other users'
  requests queue behind them (see G9).
- **Fix:** pass `timeout=15` like the coach and goal planner. *Phase 4, 2 lines.*

#### G5. Users can see an operator instruction

- **Where:** `advisor.py:39`: the copilot's fallback text says *"Check that Ollama
  is running (ollama serve)."*
- **Fix:** user-facing wording ("FinTwin AI is having a moment. Please try again
  shortly."), with the detail in logs only. *Phase 4, 1 line.*

---

### P1: quality and reliability

#### G6. Copilot answers about transactions, budgets and goals aren't checked

- **Where:** `advisor.py:205`, `finish()`. Its checks only run when
  `get_portfolio` was used.
- **Impact:** "You spent ₹8,450 on food last month" is checked by nothing. The
  system prompt *asks* the model to copy `amountFormatted`, but the coach proves
  a 3B model doesn't always comply. Copilot answers are the most-read AI text in
  the app.
- **Fix:** apply `utils/grounding.py` to copilot answers. The **licensed amounts**
  are every `amountFormatted` / `totalAmountFormatted` in this turn's tool
  results plus the snapshot. If the answer fails, retry once with a corrective
  message (the goal planner's technique), then fall back to a code-formatted list
  of the rows. *Phase 4 (still worth it on Claude, more cheaply).*

#### G7. No copilot eval set

- **Where:** `ai-service/evals/` has the coach and goal planner only.
- **Impact:** there's no way to say whether a prompt change, or Claude itself, is
  *better*. This is the key input for the Bedrock decision.
- **Fix:** 100–200 real questions (from `copilot_feedback`, with consent, plus
  synthetic ones) over a **fixture user** with known data. Each case scores:
  - the right tool with the right arguments
  - every ₹ figure correct against the fixture
  - no invented figures
  - no trade advice
  - the right format

  Run it against qwen now for the baseline. *Phase 3.*

#### G8. The AI service's health check doesn't check the model

- **Where:** `ai-service/app.py`, `health()` returns `{"status": "ok"}` unconditionally.
- **Impact:** App Service uses `/health` to decide whether to restart `fintwin-ai`.
  If Ollama crashes, or the model never finishes downloading, the app reports
  healthy forever, and every AI feature silently falls back. The admin Platform
  Health tab shows "AI online" too.
- **Fix:** keep `/health` as liveness (the process is up), and add `/ready`, which
  checks Ollama answers and the model is in `ollama list`. Show readiness on the
  admin page. On Bedrock, `/ready` checks the AWS credentials instead.
  *Phase 4.*

#### G9. No admission control in front of the model

- **Where:** ai-service runs 2 uvicorn workers. Sync routes run on a thread pool
  (~40 threads each), so up to ~80 requests can be waiting on Ollama at once.
  `OLLAMA_NUM_PARALLEL` is never set.
- **Impact:** on a 2-vCPU plan, the model effectively serves **one generation at a
  time**. Ten users asking at once means the tenth waits for nine answers,
  blows its budget, and gets a fallback after 20–90 s of waiting. Everyone gets
  slower together instead of some getting a fast "busy" reply.
- **Fix:**
  - A small semaphore around model calls, sized to what the box can serve.
  - A queue timeout: if a slot doesn't free within N seconds, return a "busy,
    try again" response immediately.
  - Set `OLLAMA_NUM_PARALLEL` explicitly.
  - Add a queue-depth metric.

  On Bedrock this becomes a guard against account throttling instead.
  *Phase 4.*

#### G10. No streaming

- **Where:** `stream: false` everywhere; the frontend waits for the whole answer.
- **Impact:** copilot answers take 10–60 s on CPU with nothing on screen. Showing
  words as they're generated is the single biggest improvement to *perceived*
  speed.
- **Fix:** stream the copilot's final answer (not the tool rounds) as
  server-sent events from ai-service through the backend to the page.
  Guardrails need the full text, so stream it, then apply the checks and swap
  in the corrected answer if needed; or stream only answers that can't fail the
  checks. *Phase 4 design, built on Claude in Phase 6 (Bedrock streams natively).*

#### G11. No per-user token budget

- **Where:** `RateLimitFilter` limits *requests per minute*. Nothing limits
  *tokens per day*.
- **Impact:** free today, because qwen runs on your CPU. On Bedrock, one user
  scripting 30 copilot calls a minute all day becomes a real bill.
- **Fix:** the `ai_token_usage` table already has per-user daily totals. Add a
  daily token cap per user (configurable, higher for admins), checked before the
  model call, with a friendly "you've reached today's AI limit" message and an
  admin alert. *Phase 3 (before the switch).*

#### G12. "Fraud Analyst" mode can't see fraud alerts

- **Where:** the copilot offers a Fraud Analyst mode (`advisor.py:125`), but none
  of its 5 tools returns anomalies. It's a known open item in project notes.
- **Fix:** a `get_anomalies` tool over `AnomalyService` (same shape as the
  others), so the mode can answer "is anything suspicious?" from real alerts.
  *Phase 4.*

#### G13. Anomaly rules have two statistical flaws

- **Where:** `backend/.../service/AnomalyService.java:134`.
- **Issues:**
  - The merchant and single-charge rules compare against the **mean**, which the
    spike itself inflates. A ₹20,000 charge among ₹500 ones raises the average it
    is judged against. The coach already uses the **median** for exactly this
    reason.
  - "This month" is `LocalDate.now()`. A statement imported in October for
    August never produces a category-spike alert.
- **Fix:** use medians, and use the newest month *in the data* (as the coach
  does). Use the stored anomaly verdicts to tune the thresholds. *Phase 4.*

---

### P2: efficiency and observability

| # | Gap | Where | Fix | Phase |
|---|---|---|---|---|
| **G14** | The transactions tool loads **every** transaction the user has and filters in Java | `InternalAIController.java:110` | A repository query with date/type/category in SQL, `ORDER BY` and `LIMIT` in the database | 4 |
| **G15** | Four features parse JSON by hand; only categories use JSON mode | coach, goal planner, report, investments | `json_mode=True` now; on Claude, structured outputs | 4 / 6 |
| **G16** | The weekly report and investments have no outcome metrics; the copilot, report, investments and categories have no `PROMPT_VERSION` | `utils/metrics.py` | Same pattern as the coach: `result` label (ai / rejected / parse_failed / llm_error) plus a version stamp in every response | 4 |
| **G17** | Likely no trace ID across backend → ai-service | `AiServiceConfig` builds `new RestTemplate(...)`, which bypasses Spring's observation customiser; ai-service doesn't read `traceparent` | Build with `RestTemplateBuilder`; log the incoming `traceparent` in ai-service; put it in the copilot trace | 4 |
| **G18** | Prompt order defeats prefix caching | Coach and report put user facts before fixed rules | Fixed instructions first, user facts last. Minor on Ollama, **money** on Claude (prompt caching) | 6 |
| **G19** | Evals don't run in CI; the report, investments and categories have none | `ai-service/evals/` | A nightly job against the chosen model, with pass-rate floors | 3 |
| **G20** | ai-service logs model output at INFO: rejected tips and plan items, which contain merchant names and amounts | `coach_engine.py:98`, `goal_planner.py:515` | Log the reason and a hash at INFO; the text only at DEBUG | 4 |
| **G21** | The investment recommendation isn't cached in the backend | `InvestmentRecommendationService` | Same fingerprint-keyed cache as the coach | 4 |

### P3: cleanup

| # | Item | Where |
|---|---|---|
| **G22** | Dead code: `chatbot/memory.py` (history comes from the backend); `anomaly_detection/` and `simulations/` hold only stale bytecode | `ai-service/` |
| **G23** | Stale comments: "phi3:mini" in `OllamaAIProvider.java:16`; "four focused tools" (there are five) in `tools.py:16` | |
| **G24** | Copilot history truncates replies to 300 characters, which can cut through a figure ("₹1,2") | `advisor.py:168`: cut at a sentence boundary |

---

## 3. Industry practices: where FinTwin stands

A checklist of what production AI systems are expected to have:

| Practice | Status | Gap |
|---|---|---|
| Output validation / grounding | ✅ Strong in coach, goals, report; ⚠️ partial in copilot | G6 |
| Fallbacks and graceful degradation | ✅ | |
| Deterministic routing | ✅ | |
| Prompt-injection defence | ✅ Rules, data fences, model can't choose `user_id` | |
| Time budgets | ⚠️ Mostly | G4 |
| Circuit breaking | ⚠️ Forecast only | G1 |
| Admission control / backpressure | ❌ | G9 |
| Health vs readiness checks | ❌ | G8 |
| Streaming responses | ❌ | G10 |
| Offline evals | ⚠️ 2 of 7 features, not in CI | G7, G19 |
| Online feedback | ✅ 👍/👎 with reasons, anomaly verdicts, category labels | |
| Per-request traces | ✅ Copilot; ⚠️ not linked across services | G17 |
| Metrics per feature | ⚠️ Coach and goals have outcomes; tokens for all | G16 |
| Prompt versioning | ⚠️ 2 of 7 features | G16 |
| Cost controls (token budgets) | ❌ Request limits only | G11 |
| Provider abstraction | ⚠️ Backend has an `AIProvider` interface; ai-service is hard-wired to Ollama | Phase 3 |
| Structured output | ⚠️ 1 of 5 JSON features | G15 |
| Secrets and service-to-service security | ⚠️ Public internal API | G2 |
| PII minimisation in prompts and logs | ⚠️ Prompts good; logs leak some text | G20 |
| Compliance review of AI advice | ⚠️ Caveats in the copilot; investments names products | G3 |

---

## 4. Opportunities (new capabilities, not fixes)

For later, once the gaps are closed:

1. **Knowledge RAG.** A small, cited knowledge base of Indian personal-finance
   rules (80C/80D, HRA, new vs old regime, SIP, ELSS, EPF/PPF), using pgvector
   on Supabase. The copilot answers "how can I save tax?" from sources instead
   of a 3B model's memory.
2. **A dedicated category classifier.** Train on the collected V20 labels
   (stage 2 of your learning roadmap). It replaces a model call with a
   millisecond one, and on Bedrock saves money on every import.
3. **Vision OCR.** Claude reads receipt photos far better than Tesseract + regex.
4. **Hindi and Hinglish.** Many Indian users think about money in Hinglish.
   Claude handles it well; qwen2.5:3b partly.
5. **Model per feature (on Bedrock).** A small, fast Claude model for category
   suggestions and short summaries; a stronger one for the copilot. The eval set
   decides where each is good enough.

---

## 5. The plan this leads to

```
Phase 3  Eval harness + provider switch     G7, G11, G19 + LLM_PROVIDER=ollama|bedrock
Phase 4  Model-independent optimisation     G1–G6, G8, G9, G12–G17, G20–G24
Phase 5  Switch to Claude on Bedrock        when the eval says so; qwen stays as fallback
Phase 6  Claude-specific optimisation       G10 (streaming), G15 (structured output), G18 (prompt caching), model per feature
```

**Recommended order inside Phase 4:** start with the five P0 items. Together
they're about a day of work, and they fix the only issues that are risky today
(the security exposure, the compliance question, the broken breaker). Then G6,
G8 and G9, which make the copilot trustworthy and the system predictable under
load.

**Why Phase 3 comes before most of Phase 4:** the eval set (G7) is what proves
each Phase 4 change actually helped, instead of assuming it did.
