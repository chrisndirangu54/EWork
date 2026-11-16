# Architecture and integration strategy

## Primary stack

Use **Lancy** (React/Vite frontend, NestJS backend, Prisma) as the initial market transaction application. Avoid running a second payments/contracts system from Freelancezero in parallel. The existing EWork application remains unmodified and can be treated as historical domain/UX reference.

```
Client organizations -> TeknTandao branded portal -> marketplace API
                                            |
                                            +-- identity/RBAC, KYB review
                                            +-- service catalog, quote, SOW, SLA
                                            +-- projects, bidding, contracts, milestones
                                            +-- messages, deliverables, reviews, disputes
                                            +-- billing adapter -> licensed payment provider
                                            +-- audit trail, metrics, compliance
Delivery managers -> vetted Kenyan teams ---+
```

## Domain additions for managed BPO/KPO

- `Organization`: legal details, country, verified signatory, billing contacts, contract status, approved subprocessors.
- `ServiceOffering`: deliverables, lead time, capacity units, currency, allowed regions, exclusions, SLA template.
- `Engagement`: client org, statement of work, confidentiality agreement, timesheets, assigned delivery manager, milestone evidence.
- `DeliveryTeam`: vetted specialist pool, expertise, verification status, rate card and substitution approvals.
- `QualityGate`: acceptance checklist, reviewer, rework decision and proof of acceptance.
- `BillingAgreement`: quote, tax treatment, invoice, payables, refund and dispute status; never represent mock payment as real funding.
- `DataProcessingInstruction`: client authorization, allowed data categories, retention, subprocessor approval, region, erasure requests.
- `AuditEvent`: immutable-enough append-only operational trail with actor, action, timestamp, target and lawful retention policy.

## Integration sequence

1. Run Lancy locally, pin dependencies, confirm tests and audit vulnerable components.
2. Add a branded TeknTandao experience in a separately maintained fork or first-party source package.
3. Implement client company onboarding/KYB, managed team assignment and a clear statement-of-work flow.
4. Implement role-based tenant isolation including tests for cross-tenant access; assign minimal permissions.
5. Add client-approved AI-assisted matching and QA with prompt-injection/data leakage controls.
6. Select a processor that supports both source and destination countries; implement payments with verifiable webhooks, reconciliation, refunds and payouts. Don't claim escrow without an appropriate regulated arrangement.
7. Add operational dashboards: utilization, gross margin, SLA attainment, lead time, client retention, contractor payout aging and support load.
8. Pilot with 2–3 real paying clients before an open seller marketplace.

## Boundaries and risk

- **Do not merge licences automatically.** Lancy and Freelancezero are MIT; their notices remain with the respective modules. EWork itself has an Apache-2.0 LICENSE.
- **Do not import unlicensed Fiverr clone code or Fiverr branding/assets** merely to duplicate layout.
- **Payments:** upstream Lancy advertises a Stripe mock provider. Do not receive, hold, or promise to escrow client funds until the relevant commercial agreements and regulations have been reviewed.
- **Privacy:** Kenya Data Protection Act/ODPC, GDPR and UK GDPR rules may apply, including international transfers, processor contracts, deletion, audit logs and access controls. Verify current legal requirements per client.
- **Security:** protect authentication boundaries, implement tenant checks server-side, parameterize queries, verify webhook signatures, rate limit auth and uploads, scan dependencies, and avoid real customer data in development.
- **Operational:** prepare contractor terms, staff training, background verification proportionate to work, incident response, escalation, professional liability cover where justified, and client SLAs.

## Build-versus-buy decision

Lancy is a *starting point*, not an obligation. Retain it only if its implementation passes functional, code-quality, and security review. Freelancezero is an alternative base if a Next.js-first app and simpler MVP scope prove more suitable.
