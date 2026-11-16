# Production release gates

These are **gates**, not claims of completed work.

- [ ] Verify source commit signatures or provenance; record source SBOM and package license audit.
- [ ] Run frontend build, lint, unit/integration tests and manual end-to-end scenarios.
- [ ] Run backend tests, schema migration on a clean database and controlled rollback.
- [ ] Complete dependency and secret scanning; upgrade vulnerable dependencies.
- [ ] Replace development SQLite with a managed, backed-up production database where appropriate.
- [ ] Validate authentication/session security, password policies, MFA, tenant-level RBAC, file upload restrictions and audit log permissions.
- [ ] Verify all webhook signatures, idempotent payments, integer currency handling and reconciliation.
- [ ] Remove all mock payment wording from any real checkout; prove success/refund/chargeback behavior in test mode first.
- [ ] Review payment-flow legality and processor availability in Kenya and each target market; don't self-custody escrow without authorization.
- [ ] Document client contracts, confidentiality, subcontractor/IP assignment terms, acceptance/dispute procedures, invoices and applicable taxes.
- [ ] Document data processing and cross-border transfer bases; confirm necessary Kenya/UK/EU privacy obligations.
- [ ] Implement encrypted backups, recovery tests, audit retention, monitoring, alerting and incident-response runbooks.
- [ ] Add spam/fraud controls, verified provider profiles, company checks and moderation.
- [ ] Run pilot with actual customers, monitor SLA and finance metrics, and acquire explicit go-live approval.

No checkbox above has been marked complete by adding these source modules.
