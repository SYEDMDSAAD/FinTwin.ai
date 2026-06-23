# FinTwin AI — Information Security Policy

**Version:** 1.0  
**Effective Date:** 2026-06-23  
**Owner:** Engineering Lead  
**Review Cycle:** Annual (next review: 2027-06-23)

---

## 1. Purpose and Scope

This policy defines the security controls FinTwin AI maintains to protect user financial data. It applies to all production systems, developers, contractors, and third-party integrations that access or process FinTwin AI data.

---

## 2. Data Classification

| Class | Examples | Controls |
|---|---|---|
| **Restricted** | Bank account numbers, PAN, transaction history, AA consent tokens | AES-256-GCM encryption at rest; TLS 1.2+ in transit; access-logged |
| **Confidential** | Passwords (BCrypt-12), JWT secrets, encryption keys | Never logged; stored in environment variables only; never in source code |
| **Internal** | Financial scores, budget summaries, AI insights | Authentication required; audit-logged |
| **Public** | Marketing content, API documentation | No restriction |

---

## 3. Access Control (PCI-DSS Req 7 & 8)

- Principle of least privilege: each service account has only the permissions it needs.
- Database app user has `INSERT, SELECT` on `audit_log`; no `UPDATE` or `DELETE`.
- Admin role assignment requires the `ADMIN_KEY` environment variable; self-promotion is blocked.
- Passwords require: ≥8 characters, 1 uppercase, 1 digit, 1 special character (enforced by `PasswordValidator`).
- Passwords are stored as BCrypt with cost factor 12.
- TOTP 2FA is available and enforced for admin accounts.
- Sessions are stateless JWT; force-logout is implemented via `lastLogoutAt` comparison on every request.

---

## 4. Encryption (PCI-DSS Req 3 & 4)

- **At rest:** Sensitive fields (account numbers, tokens) are encrypted with AES-256-GCM via `EncryptionConverter` before writing to the database.
- **In transit:** TLS 1.2+ enforced at Nginx for all external traffic. Internal Docker network traffic is within the same host and not internet-routable.
- **Keys:** `FINTWIN_ENCRYPTION_KEY` and `JWT_SECRET` are stored as environment variables, never committed to source control.
- **Key rotation:** Encryption key rotation is performed by re-encrypting all affected rows and cycling the environment variable. Documented in the runbook.

---

## 5. Secure Development (PCI-DSS Req 6)

- All code changes require pull request review before merging to `main`.
- `DataSeeder` (hardcoded dev data) is gated with `@Profile("dev")` and never runs in production.
- File uploads validate MIME type against an allowlist and enforce a 5 MB size limit.
- SQL access is exclusively through JPA/Hibernate parameterised queries; raw SQL is prohibited.
- Dependencies are reviewed for CVEs via `mvn dependency:check` before each release.
- CORS is restricted to the configured `CORS_ALLOWED_ORIGINS` environment variable.

---

## 6. Audit Logging (PCI-DSS Req 10)

- All authentication events (login, logout, failed attempts), admin actions, financial data reads, and data exports are written to `audit_log`.
- Audit records are INSERT-only (no UPDATE or DELETE at application level).
- Logs include: user ID, action, resource, IP address, user agent, timestamp, success/failure.
- Impersonation sessions carry an `imp_by` JWT claim so every action is traceable to the originating admin.
- Retention: audit records are retained for **7 years** (GLBA/PCI-DSS requirement). A nightly job at 02:00 purges records older than the configured window (`audit.retention.years=7`).

---

## 7. Network Security (PCI-DSS Req 1)

- Only ports 80 and 443 are exposed to the internet.
- Backend (port 8080), database (port 5432), and AI service (port 8000) are on an internal Docker bridge network with no public exposure.
- Firewall rules are managed via `ufw` (see `ops/firewall-setup.sh`).
- The AI service has no `ports:` declaration in `docker-compose.yml`.

---

## 8. Vulnerability Management (PCI-DSS Req 5 & 11)

- ClamAV is installed and runs weekly scans on the host (see `ops/clamav-setup.sh`).
- OWASP ZAP baseline scan is run against staging before each release (see `ops/zap-scan.sh`).
- Penetration testing is conducted annually by an external party; the most recent report is filed in the team's secure document store.

---

## 9. Privacy and Consent (GDPR / GLBA)

- Users provide explicit, timestamped consent (`consent_given_at`) at registration before any data is processed.
- A GLBA data disclosure notice is shown and must be acknowledged before bank account linking.
- Users can export all their data via `GET /api/profile/export` (GDPR Article 20).
- Users can delete their account and all associated data via `DELETE /api/profile/delete` (GDPR Article 17).
- Financial data is never sold to or shared with third parties beyond what is required to provide the service.
- Data Processing Agreement with Setu AA (Account Aggregator) is on file.

---

## 10. Physical Security (PCI-DSS Req 9)

FinTwin AI is hosted on a PCI-DSS Level 1 certified cloud provider. The provider's Attestation of Compliance (AOC) is on file and covers physical data center security on our behalf.

---

## 11. Policy Compliance and Violations

Any employee or contractor who violates this policy is subject to disciplinary action up to and including termination. Security incidents must be reported immediately per the Incident Response Plan (`docs/incident-response-plan.md`).

---

## 12. Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-06-23 | Engineering Lead | Initial version |
