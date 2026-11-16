# TeknTandao Global Services — marketplace foundation

This directory introduces a **reviewable, non-production** starting point for a Kenyan technology BPO/KPO and managed-services marketplace serving UK, EU and US companies.

## Source projects pinned as Git submodules

| Path | Upstream | Purpose | License |
| --- | --- | --- | --- |
| `upstream/lancy` | https://github.com/Hamenath/lancy | **Primary** freelancer/client marketplace, bids, contracts, milestones, messaging, admin/disputes | MIT |
| `reference/freelancezero` | https://github.com/freelancezero/freelancezero | **Reference only** for Next.js discovery, onboarding and marketplace data models | MIT |

The two projects are pinned at reviewed upstream commit IDs. They are **not** two backends to run together, and they are **not** copied into the main repository: submodule checkout fetches the source from the attributed upstream projects. Retain the upstream `LICENSE` files and notices.

## Checkout

```bash
git clone --recurse-submodules https://github.com/chrisndirangu54/EWork.git
cd EWork
git checkout feat/tekntandao-global-services-foundation
git submodule update --init --recursive
bash marketplace/scripts/check-foundation.sh
```

If you have already cloned EWork, fetch the branch before checkout:

```bash
git fetch origin feat/tekntandao-global-services-foundation
git checkout feat/tekntandao-global-services-foundation
git submodule update --init --recursive
```

## Start the reference marketplace (development only)

```bash
cd marketplace/upstream/lancy
docker compose up --build
```

The upstream Docker setup describes a frontend on `http://localhost:5173` and backend on `http://localhost:4000`. Follow upstream README and environment configuration before running. By default, the example backend uses local SQLite, mock AI and mock Stripe payments: **not production billing**. Do not add real payment credentials or customer data while evaluating the foundation.

## Intended TeknTandao workflow

1. International company registers and passes organization verification.
2. Client requests a fixed-scope project, ongoing managed service or vetted team.
3. TeknTandao estimates scope, price, delivery milestones and SLA; assigns vetted Kenyan professionals.
4. Client approves the statement of work and payment terms; real payment collection runs only after legal and processor review.
5. Teams deliver tasks through the platform, with appropriate access control and audit trails.
6. Client reviews deliverables; invoicing and payouts follow verified contract terms.
7. AI assists with matching, briefs, quality checks and scheduling **only where authorized**.

Start with a **managed delivery model**: TeknTandao owns quality assurance and service delivery, instead of opening an unrestricted freelance marketplace on day one.

## Contents

- `docs/ARCHITECTURE.md` — integration boundaries and technical decisions.
- `docs/RELEASE_CHECKLIST.md` — before-money and before-customer-data controls.
- `docs/PROVENANCE.md` — sources, pinned revisions and license notes.
- `config/service-catalog.json` — initial branded services; catalog prices deliberately omitted.
- `scripts/check-foundation.sh` — non-destructive submodule verification.

## Status

This is a **foundation integration proposal**. Existing EWork ASP.NET application code remains untouched; this branch does **not** claim a production-ready, integrated marketplace or deployment. Upstream functionality and advertised production readiness are unverified until tests, code review and security assessment pass.
