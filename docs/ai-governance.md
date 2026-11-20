# AI governance in FinTwin

How FinTwin's AI features handle data, what stops them going wrong, and what is
logged so a problem can be traced. Reviewed and tightened on 20 Nov 2026; the
open items at the end still need decisions.

## Where AI is used

| Feature | Model | What it is given |
|---|---|---|
| AI Copilot (`/chat`) | `gemini-3.7-flash` on Vertex AI | Headline figures (monthly income, expenses, savings, score, spending by category), the last three exchanges, and whatever its data lookups return for this question |
| Spending Coach | `gemini-3.5-flash-lite` | Findings computed in code from 3 months of transactions (date, merchant, category, amount) |
| Goal planner, weekly report, investment summary | `gemini-3.5-flash-lite` | Aggregates only: totals, rates, goal targets, allocation percentages |
| Category suggestions | `gemini-3.5-flash-lite` | Payee names only, numbered; never amounts, dates or accounts |
| Spend Guard | `gemini-3.7-flash` (guard-service) | Governed separately by `.agents/skills/spend-guard-guardrails/SKILL.md` |

Forecasts, statement import, OCR and market data use no language model.

## 1. Data minimisation

- **Lookups instead of dumps.** The Copilot starts with headline figures only.
  Transactions, budgets, goals, net worth, holdings and Spend Guard are fetched
  through six read-only tools when a question needs them
  (`ai-service/chatbot/tools.py`).
- **Field-level trimming at the source.** The backend's AI data API
  (`InternalAIController`) returns date, merchant, category and amount for a
  transaction; never notes, descriptions, account numbers or balances.
- **Masking before any model sees it.** Every prompt and message passes
  through `ai-service/utils/redact.py`, applied inside `utils/llm_client.py`
  (the single gateway to every provider). Masked: email addresses, UPI IDs,
  mobile numbers, card, Aadhaar and account numbers, PANs, and anything
  shaped like a credential (JWTs, bearer tokens, API keys, "password: …").
  Amounts, dates, percentages and merchant names are untouched, since answers
  are checked against them.
- **The backend masks too.** Copilot questions are masked by
  `com.fintwin.util.PiiRedactor` before they are sent or stored, so a card
  number typed into the chat never reaches the AI service or the database.
- **Real data only to Vertex AI.** The AI service builds its Gemini client
  from Google Cloud credentials and a project, never an API key
  (`utils/gemini_client.py`). Spend Guard's free-key path sees a made-up
  persona only.
- **Known trade-off:** names of people the user paid ("Paid to Rahul") still
  reach the model, because "how much did I send Rahul?" needs them. Their
  UPI IDs and phone numbers do not.

## 2. Least privilege

- **One user per request.** The backend mints a signed tool token for the
  user being answered (`security/AiToolToken.java`, HMAC, 5-minute life).
  The AI service can pass it back but can't create one, and the user ID comes
  from the backend's request, never from the model's arguments, so no prompt
  can point a lookup at another user.
- **Read-only.** None of the Copilot's tools writes anything. No AI feature
  can move money; Spend Guard hands off to the user's own UPI app.
- **Service-to-service key.** Every AI service route except `/` and `/health`
  needs `X-Internal-Key` (constant-time comparison; the service refuses to
  start without one).
- **Per-user allowance.** 200,000 model tokens a day per user
  (`AiTokenUsageService`), demo visitors have a question cap, and the API is
  rate-limited.

## 3. Guardrails

- **Topic boundary.** The Copilot only discusses money, the user's FinTwin data
  and how to use FinTwin. Anything else gets the marker `OUT_OF_SCOPE` from
  the model, which code turns into one fixed refusal (`safe_reply` in
  `chatbot/advisor.py`), so the refusal can't be talked into something longer.
- **Prompt injection.**
  - Direct: the user's question is labelled untrusted input; requests to
    reveal or change the instructions are out of scope.
  - Indirect: merchant names come from bank statements and payment notes
    that anyone can write. The prompt says tool results are data, never
    instructions, and code removes what an injected instruction could use:
    images and links are stripped from every answer (an image URL can carry
    the user's figures out the moment the browser loads it), and
    identifiers are masked. The page renders answers through
    `components/SafeMarkdown.jsx`: no images, no clickable links, no raw HTML.
- **Grounding.** Coach, goal-plan and report text is checked in code against
  the figures it was given, and ungrounded sentences are dropped. Portfolio
  answers that contradict the data are rebuilt from the figures, and buy/sell
  advice is cut.
- **Not investment advice.** The prompt says FinTwin AI is not a
  SEBI-registered investment adviser; portfolio answers carry the caveat in
  code; the Copilot page says answers can be wrong and are guidance.
- **Probe results** (made-up data, real Gemini, 20 Nov 2026; kept outside the
  repo): before the change the Copilot answered all four off-topic questions
  (capital of France, Python code, a poem, cricket). After it, all four plus
  both jailbreaks got the fixed refusal. Finance questions were still
  answered, and an instruction planted in a merchant name was ignored. The
  26-case Copilot eval had no wrong refusals.

## 4. Logs, for fixing problems without exposing anyone

| Record | Where | Kept | What's in it |
|---|---|---|---|
| Conversation log | `chat_history` (question and answer AES-256-GCM encrypted, masked) | Last 50 exchanges per user; user can clear | Question, answer, and a trace: path, tools called with arguments, checks applied, outcome (e.g. `off_topic`), model, duration |
| Rated answers | `copilot_feedback` (encrypted) | Until the user clears chat or deletes the account | Copy of the exchange and trace. Admins see unhelpful ones only from users who consented |
| Action log | `audit_log` | 7 years (`audit.retention.years`) | Audited actions, plus `AI_READ` for every lookup the Copilot made (which data, which user, when). Error text is masked |
| Application logs | stdout (Cloud Logging) | Platform default | Every line masked (`logging/MaskedMessageConverter`, `PiiValueMasker` for JSON, `MaskedThrowableConverter` for stack traces; `utils/redact.RedactingFilter` in the AI service; identity service likewise). Users appear as `userRef`, the first 12 characters of their keyed email hash, never their email |

To trace one problem: the backend's `traceId` is sent to the AI service as
`X-Request-Id`, and every AI service line carries it. An admin can find a
user's lines by matching `userRef` to the start of `users.email_hash`.

Before this review the AI service had no log handler of its own: its info
lines (tool calls, rejected answers) were dropped and its warnings were
written unmasked.

## 5. Oversight, transparency and rights

- Users rate answers (helpful / not, with a reason); the admin dashboard
  splits ratings by the path that produced them. Offline evals exist for the
  Copilot, coach and goal planner (`ai-service/evals/`).
- AI text is labelled: the coach marks AI-written lines, and the Copilot page
  carries a notice.
- The privacy policy (section 4) names Google Cloud's Vertex AI as the
  processor, says what is sent and masked, that it may be processed outside
  India, and that Google doesn't train on it.
- Users can clear their chat history (rated copies go with it), export their
  data, and delete their account. Deletion removes chats, feedback, token
  usage and Spend Guard records through `ON DELETE CASCADE`.

## Open items

These need a decision or a live change:

1. **Cloud identities.** All five Cloud Run services run as the default
   compute service account, which holds **Editor** on the whole project.
   Least privilege would be one service account per service, with only
   `roles/aiplatform.user` for the AI and guard services and no project role
   for the others.
2. **Secrets as plain environment variables** on Cloud Run (internal key, JWT
   secret, database password). Move them to Secret Manager.
3. **`fintwin-ai` accepts unauthenticated traffic** and relies on the
   internal key. Restricting invocation to the api's service account adds a
   second lock.
4. **No Content-Security-Policy** on the web front door. An `img-src`
   allow-list would block image-based exfiltration for every page, not just
   the Copilot.
5. **Processing region.** Gemini runs on the `global` endpoint. Pinning
   `gemini-3.5-flash-lite` to an Indian region would keep most calls in India.
   `gemini-3.7-flash` is only on `global` today.
6. **Trial billing** randomly refuses about one Vertex call in three (retried
   up to six times). Activating the full billing account fixes it; a budget
   alert on the project would cap surprises.
7. Copilot conversations stored **before 20 Nov 2026** were not masked
   retroactively.
8. A copy of `backend/.env` sits in the Cloud Build source bucket from an
   earlier upload. `.gcloudignore` files now keep `.env` and `venv` out.
