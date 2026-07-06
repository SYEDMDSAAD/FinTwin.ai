# FinTwin AI — Incident Response Plan

**Version:** 1.1  
**Effective Date:** 2026-07-06  
**Owner:** Engineering Lead  
**Review Cycle:** Annual (next review: 2027-06-23)

---

## 1. Purpose

This plan defines how FinTwin AI detects, contains, investigates, and recovers from security incidents affecting user financial data. It satisfies PCI-DSS Requirement 12.10 and GDPR Article 33 (72-hour breach notification).

---

## 2. Incident Severity Levels

| Level | Description | Response Time |
|---|---|---|
| **P1 — Critical** | Active breach; financial data exposed; service down | Immediate (< 1 hour) |
| **P2 — High** | Suspected breach; unauthorized admin access; data exfiltration attempt | < 4 hours |
| **P3 — Medium** | Anomalous access patterns; brute-force attempts; dependency CVE | < 24 hours |
| **P4 — Low** | Misconfiguration with no data exposure; failed pen-test finding | < 72 hours |

---

## 3. Incident Response Team

| Role | Responsibility |
|---|---|
| **Incident Commander** | Engineering Lead — coordinates all response activities |
| **Security Analyst** | Investigates logs, traces attack vector |
| **Communications Lead** | User and regulatory notifications |
| **Legal / DPO** | GDPR/RBI notification decisions |

---

## 4. Detection

Incidents may be detected via:

- **Automated security alert (push)** — `SecurityAlertService` evaluates the
  security posture every 5 minutes (configurable) and **emails all enabled
  admins when the risk level is HIGH**, with de-duplication so a persistent
  attack sends one alert plus periodic reminders rather than one per tick. This
  is the primary push channel — it does not require anyone to be watching the
  dashboard. Requires `MAIL_ENABLED=true`; when email is off it still logs the
  HIGH state at WARN. Tunables: `SECURITY_ALERTS_ENABLED`,
  `SECURITY_ALERTS_INTERVAL_MS`, `SECURITY_ALERTS_COOLDOWN_MIN`.
- **Prometheus alert rules + Alertmanager** — `k8s/monitoring/prometheus-configmap.yaml`
  (`alert.rules.yml`) fires on backend/AI downtime, 5xx error-rate, p95 latency,
  a 401/403 auth-failure spike, JVM heap, and DB-pool exhaustion. Prometheus
  forwards firing alerts to **Alertmanager** (`k8s/monitoring/alertmanager.yaml`),
  which emails the on-call inbox (criticals notify in 10s and repeat hourly;
  warnings group over 5m). Set the SMTP password in `alertmanager-secret.yaml`
  and the relay/recipient in `alertmanager.yaml` before applying; a Slack
  receiver is included commented-out.
- **Admin Security Dashboard** (`/api/v1/admin/security`) — brute-force IPs,
  targeted accounts, suspicious sessions (one user, many IPs), data anomalies
  (bulk reads), blocked IPs, and a **Configuration & Hardening** panel flagging
  dev-default secrets / plaintext transport / weak config.
- **Audit log anomalies** — query `audit_log` for unusual volumes of failed
  logins, bulk READ events, or DELETE actions (see `AuditLogRepository`
  analytics queries), or via `GET /api/v1/admin/audit-logs`.
- **Automatic containment signals** — a refresh-token *reuse* event in the
  identity service auto-revokes the user's entire session family and logs at
  WARN (`TokenReuseGuard`); account lockout trips after repeated failures.
- **User report** — user reports unauthorised account activity (users also
  receive an SMS on login when a phone is on file).
- **Dependency/scan findings** — OWASP dependency-check and Trivy run in CI
  (`security.yml`); TruffleHog scans for committed secrets.

---

## 5. Response Phases

### Phase 1 — Identify (0–1 hour for P1/P2)

1. Determine the incident type: breach, DoS, insider threat, misconfiguration.
2. Query audit logs to establish timeline:
   ```sql
   SELECT * FROM audit_log
   WHERE timestamp >= NOW() - INTERVAL '24 hours'
   ORDER BY timestamp DESC;
   ```
3. Check for active impersonation sessions (`imp_by` claim in JWTs). Backend
   impersonation is now restricted to SUPER_ADMIN, blocks admin targets, and is
   audit-logged — check `audit_log` for `admin/impersonate` actions.
4. Identify affected user accounts.

### Phase 2 — Contain

**For active breach:**
- Force-logout affected users via `PUT /api/v1/admin/users/{id}/force-logout`
  (sets `lastLogoutAt`, invalidating their tokens across backend and identity).
- Reset a compromised account's password via
  `POST /api/v1/admin/users/{id}/reset-password` — this also revokes refresh tokens.
- Rotate `JWT_SECRET` and restart the backend — invalidates **all** active
  sessions at once (nuclear option).
- Rotate `FINTWIN_ENCRYPTION_KEY` and run `POST /admin/migrate-encryption`
  (X-Admin-Key) to re-encrypt if the key is compromised.
- If the database is compromised: take it offline and restore from the last
  clean backup (managed-DB PITR, or the `db` container for compose).

**For brute-force / credential stuffing:**
- Block attacking IPs from the admin dashboard
  (`POST /api/v1/admin/security/blocked-ips`) or, at the network edge,
  `ufw deny from <IP>` (compose) / a `NetworkPolicy` or cloud firewall rule (k8s).
- Force-logout targeted accounts.
- Account lockout is **already active** (5 failed attempts → 15-minute lock,
  covering password, 2FA, and email-OTP failures) — no deploy needed.

**For malware on host:**
- Isolate the host from the network.
- Run full ClamAV scan: `clamscan -r / --log=/var/log/clamav/incident-$(date +%Y%m%d).log`.
- Provision a new clean host from the last known-good snapshot.

### Phase 3 — Investigate

1. Preserve all logs before any remediation that might overwrite them.
2. Export full audit log for the incident window.
3. Determine: what data was accessed, by whom, from where, and for how long.
4. Identify the root cause (vulnerability, misconfiguration, compromised credential).

### Phase 4 — Notify

**GDPR Article 33** — If personal data of EU residents was breached:
- Notify the relevant Data Protection Authority **within 72 hours** of becoming aware.
- If high risk to individuals: notify affected users without undue delay (Article 34).

**RBI / SEBI** — If financial data or AA consent data was involved:
- Notify RBI DPSS and Setu AA within 24 hours per the AA framework agreement.

**User notification template:**
> "We are writing to inform you that FinTwin AI experienced a security incident on [DATE]. We detected [BRIEF DESCRIPTION]. The following types of data may have been affected: [LIST]. We have [CONTAINMENT ACTIONS TAKEN]. As a precaution, we have logged you out of all sessions and recommend changing your password. We apologise for any concern this causes."

### Phase 5 — Recover

1. Patch the root cause before bringing systems back online.
2. Restore from verified clean backup if data was altered.
3. Run OWASP ZAP scan against staging to verify the fix.
4. Bring services back online in sequence: `db` → `backend` → `nginx`.
5. Monitor audit logs closely for 48 hours post-recovery.

### Phase 6 — Post-Incident Review

Within 5 business days of resolution:
- Write a post-mortem: timeline, root cause, impact, actions taken, preventive measures.
- Update this plan if gaps were identified.
- File the post-mortem in the secure document store.

---

## 6. Key Commands Reference

Two deployment targets exist — Docker Compose (single host) and Kubernetes.
Commands are given for both.

```bash
# ── Restart backend / rotate JWT secret (invalidates all JWT sessions) ────────
# Compose:
nano .env                              # update JWT_SECRET (skip to just restart)
docker compose restart backend
# k8s: update the fintwin-secrets Secret, then roll the deployment
kubectl -n fintwin rollout restart deployment/backend

# ── Recent audit log (last 100 events) ───────────────────────────────────────
# Compose:
docker compose exec db psql -U postgres fintwin \
  -c "SELECT timestamp, user_id, action, resource, ip_address, success FROM audit_log ORDER BY timestamp DESC LIMIT 100;"
# k8s:
kubectl -n fintwin exec statefulset/postgres -- psql -U postgres fintwin \
  -c "SELECT timestamp, user_id, action, resource, ip_address, success FROM audit_log ORDER BY timestamp DESC LIMIT 100;"
# Or, from the app: GET /api/v1/admin/audit-logs  (admin JWT)

# ── Block an attacking IP ─────────────────────────────────────────────────────
# App (preferred — expiring, audited):
curl -X POST https://<host>/api/v1/admin/security/blocked-ips \
  -H "Authorization: Bearer <ADMIN_JWT>" -H "Content-Type: application/json" \
  -d '{"ip":"<ATTACKER_IP>","reason":"incident","expiresHours":"24"}'
# Host firewall (compose): ufw deny from <ATTACKER_IP>

# ── Live posture / are we under attack right now ──────────────────────────────
curl -s https://<host>/api/v1/admin/security/posture -H "Authorization: Bearer <ADMIN_JWT>"

# ── Logs (last hour) ──────────────────────────────────────────────────────────
docker compose logs --since=1h backend            # compose
kubectl -n fintwin logs -l app=backend --since=1h # k8s

# ── Container / pod status ────────────────────────────────────────────────────
docker compose ps                                 # compose
kubectl -n fintwin get pods                        # k8s
```

---

## 7. Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-06-23 | Engineering Lead | Initial version |
| 1.1 | 2026-07-06 | Security review | Added active alerting (SecurityAlertService email + Prometheus rules) and dashboard config panel to Detection; corrected API paths to `/api/v1/admin/...`; noted account lockout and SUPER_ADMIN-only impersonation are already shipped; added k8s command equivalents alongside Compose. |
