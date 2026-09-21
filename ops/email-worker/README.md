# Bank alert email relay

Users forward their bank's transaction alert emails to a private address,
`u-<token>@<your inbound domain>`. This Cloudflare Email Worker receives those
emails and passes each one, unchanged and signed, to the FinTwin backend at
`POST /api/v1/inbound/email`. The backend does everything else:

1. checks the webhook signature and timestamp (shared secret, 5-minute window)
2. finds the user from the address token
3. verifies the bank's **DKIM signature**, and that the signing domain matches the From address
4. reads the transaction and deduplicates it against statements, bank links and earlier alerts

The worker never parses or stores email.

## One-time setup

You need a domain on Cloudflare. A subdomain used only for this is cleanest,
for example `in.fintwin.app`.

1. **Email Routing.** Cloudflare dashboard → your domain → Email → Email Routing → enable it.
   This adds the MX and TXT records.
2. **Secret.** Generate one secret and use the same value in both places:
   ```bash
   openssl rand -hex 32
   ```
3. **Deploy the worker:**
   ```bash
   cd ops/email-worker
   npx wrangler login
   npx wrangler secret put INBOUND_EMAIL_SECRET     # paste the secret
   # set FINTWIN_WEBHOOK_URL in wrangler.toml to https://<your backend>/api/v1/inbound/email
   npx wrangler deploy
   ```
4. **Route mail to it.** Email Routing → Routing rules → **Catch-all address** → action
   *Send to a Worker* → `fintwin-email`. Every `u-…@` address reaches the worker; the
   backend decides which ones are real.
5. **Configure the backend** (`backend/.env`):
   ```bash
   INBOUND_EMAIL_DOMAIN=in.fintwin.app
   INBOUND_EMAIL_SECRET=<the same secret>
   ```
   With both set, the Imports page shows each user their forwarding address. If the secret
   is shorter than 32 characters, the backend refuses to start in production.

## Checking it works

- **The worker's tests:** `npm test` in this folder. They pin the HMAC signature to the same
  test vector as the backend's `InboundEmailServiceTest`, so the two can't drift apart.
- **End to end:** forward one real alert. The Imports page's *Recent alerts* list should show
  **Added**. Other statuses:
  - **Couldn't read**: the bank's wording didn't match the alert parser (`BankAlertParser`).
    Add that wording as a test case and adjust the parser.
  - **Not verified**: the DKIM check failed. Check that the email reached Gmail directly from
    the bank; mail relayed through another service can lose its signature.

## Behaviour to know

- **Redelivery on 5xx.** When the backend answers 503 (it couldn't fetch the bank's DKIM
  key), the worker throws to ask for redelivery. Cloudflare doesn't document whether a thrown
  error is a temporary or a permanent SMTP failure. If it proves permanent, that one alert is
  lost; the transaction still arrives with the next statement import.
- **No email content is stored.** The backend keeps a per-email outcome (bank, status, account)
  for the *Recent alerts* list. It never keeps the subject or body.
- **Leaked addresses.** If a forwarding address leaks, the user can replace it from the Imports
  page. Mail to the old address is then dropped. Knowing an address never lets anyone add
  transactions, because they can't produce a bank's DKIM signature.
