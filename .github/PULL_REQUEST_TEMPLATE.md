## What does this PR do?

<!-- One sentence summary -->

## Type of change

- [ ] Bug fix (patch)
- [ ] New feature (minor)
- [ ] Breaking change (major)
- [ ] Security fix
- [ ] Performance improvement
- [ ] Refactor / cleanup
- [ ] Docs / config only

## Checklist

### Code quality
- [ ] No direct repository access in controllers (use service layer)
- [ ] No `findAll()` without pagination on large tables
- [ ] No new N+1 queries

### Database
- [ ] If schema changed: Flyway migration added (`V{n}__description.sql`)
- [ ] If schema changed: `ddl-auto=validate` still passes locally
- [ ] New tables/columns have appropriate indexes

### Security
- [ ] No secrets, passwords, or keys in code or comments
- [ ] New PII fields use `@Convert(converter = EncryptionConverter.class)`
- [ ] New endpoints have correct `@PreAuthorize` / security config
- [ ] No new SQL injection vectors (use JPQL parameters, not string concat)

### Testing
- [ ] Tested the happy path manually
- [ ] Tested edge cases (empty input, null, large payload)
- [ ] No regressions in existing features I touched

### Fintech-specific
- [ ] Financial calculations reviewed for precision (no floating-point errors)
- [ ] Audit log entries added for any new sensitive operations
- [ ] Rate limiting applies to any new public endpoints

## How to test

<!-- Steps to reproduce / verify the change -->

## Screenshots (if UI change)
