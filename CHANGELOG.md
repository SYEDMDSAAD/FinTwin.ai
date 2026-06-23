# Changelog

All notable changes to FinTwin.ai are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH.

- **MAJOR** — breaking API changes or data model changes requiring migration
- **MINOR** — new features, backward compatible
- **PATCH** — bug fixes, security patches, performance improvements

---

## [Unreleased]

---

## [0.1.0] - 2026-06-23

### Added
- Core authentication: JWT, Google OAuth, 2FA (TOTP)
- Financial data: transactions, budgets, goals, assets, liabilities, investments
- AI chatbot: Ollama/phi3:mini powered financial advisor
- Bank connectivity: Setu Account Aggregator integration
- Crypto portfolio tracking
- Financial health score and history
- Admin panel: user management, security posture, support tickets
- Field-level AES-256/GCM encryption for all sensitive data
- PCI-DSS Req 10 audit log
- Rate limiting: Redis distributed + in-memory fallback
- HikariCP connection pool tuning
- Spring Boot Actuator health/readiness probes
- Docker multi-stage builds + docker-compose (dev + prod)
- Kubernetes manifests: Deployments, HPA, Ingress, cert-manager TLS
- Flyway versioned DB migrations (V1 schema, V2 indexes, V3 audit_log partitioning)
- Supabase (managed PostgreSQL) as production database

### Security
- Email stored encrypted; lookups via SHA-256 hash
- All PII fields encrypted at rest
- Brute-force detection and IP blocking
- Admin endpoints protected by role + API key

---

<!-- versions are linked at the bottom -->
[Unreleased]: https://github.com/your-org/fintwin-ai/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/fintwin-ai/releases/tag/v0.1.0
