# FinTwin AI — Incident Response Plan

**Version:** 1.0  
**Effective Date:** 2026-06-23  
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

- **Audit log anomalies** — query `audit_log` for unusual volumes of failed logins, bulk READ events, or DELETE actions (see `AuditLogRepository` analytics queries).
- **ClamAV alerts** — malware detected on host (see `/var/log/clamav/`).
- **OWASP ZAP** — vulnerability found in pre-release scan.
- **User report** — user reports unauthorised account activity.
- **Monitoring alert** — uptime/error-rate threshold breached.

The Admin Security Dashboard (`/admin/security`) shows real-time brute-force IP detection and suspicious session analytics from the audit log.

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
3. Check for active impersonation sessions (`imp_by` claim in JWTs).
4. Identify affected user accounts.

### Phase 2 — Contain

**For active breach:**
- Force-logout all affected users via `PUT /api/admin/users/{id}/force-logout`.
- Rotate `JWT_SECRET` in `.env` and restart the backend container — invalidates all active sessions.
- Rotate `FINTWIN_ENCRYPTION_KEY` and re-encrypt affected records if key is compromised.
- If database is compromised: take the `db` container offline, restore from last clean backup.

**For brute-force / credential stuffing:**
- Block attacking IPs at the firewall: `ufw deny from <IP>`.
- Force-logout targeted accounts.
- Enable account lockout (contact engineering to deploy the lockout patch).

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

```bash
# Force-restart backend (invalidates all JWT sessions)
docker compose restart backend

# Rotate JWT secret (edit .env first, then restart)
nano .env  # update JWT_SECRET
docker compose restart backend

# Check recent audit log (last 100 events)
docker compose exec db psql -U postgres fintwin \
  -c "SELECT timestamp, user_id, action, resource, ip_address, success FROM audit_log ORDER BY timestamp DESC LIMIT 100;"

# Block an IP at the firewall
ufw deny from <ATTACKER_IP>

# Full ClamAV scan
clamscan -r /home/syed-mohammad-saad/Desktop/FinTwin.ai \
  --log=/var/log/clamav/incident-$(date +%Y%m%d).log

# Check running containers
docker compose ps

# View backend logs for last hour
docker compose logs --since=1h backend
```

---

## 7. Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-06-23 | Engineering Lead | Initial version |
