# Pursberry Business Suite — Product Requirements Document
### Horizontal SME Finance, Payroll/HR & CRM Product — Built on the Shared Pursberry Core Platform

**Companion product to:** Pursberry Inventory-POS
**Shared foundation:** Pursberry Core monorepo — one tenancy layer, one double-entry ledger, one auth/RBAC system, one subscription billing engine
**Status:** Pre-build — Pursberry Core's Phase 1 tenancy spine exists; this PRD scopes Suite's own modules for delivery alongside it.

---

## 1. Executive Summary

Pursberry Business Suite is the horizontal counterpart to Pursberry Inventory-POS. Where Inventory-POS serves retail and wholesale trade (supermarkets, distributors, FMCG), Business Suite serves everyone else: professional services firms, agencies, IT/tech companies, healthcare providers, light manufacturers, logistics operators, and general B2B SMEs who need business records, tax compliance, payroll, and client management — but have no use for a checkout counter, barcode scanning, or shelf-location inventory.

Both products are sold and branded separately, but **neither is a separate backend.** They are two front-facing applications — `apps/suite-web` and `apps/pos-web` / `apps/pos-desktop` — sharing one Postgres database, one tenancy/RLS layer, one Chart-of-Accounts/journal engine, and one subscription billing system inside the `pursberry-core` monorepo. This PRD defines Suite's product scope and requirements, and is explicit throughout about which parts are new build versus direct reuse of what Inventory-POS's development plan already established.

---

## 2. Alignment with Pursberry Inventory-POS

This section is the load-bearing part of this document — every requirement below is written against it.

### 2.1 What Suite reuses unchanged

| Shared capability | Owner package/module | Reused as-is? |
|---|---|---|
| Tenant provisioning, auth (JWT + refresh), RBAC | `packages/db`, `apps/api/modules/(auth, tenant)` — TEN-1xx | Yes — Suite adds new *roles* (HR Manager, Payroll Admin, Sales Rep) to the existing RBAC model, not a new auth system |
| Row-Level Security (`tenant_id` on every table) | `packages/db/prisma` | Yes — every new Suite table follows the same two rules already governing POS tables (see §7) |
| Double-entry ledger (Chart of Accounts, journal engine, Trial Balance/P&L/Balance Sheet) | `apps/api/modules/accounting` — ACC-1xx | Yes — Suite's payroll postings and invoicing post through the *same* journal engine POS's sales/purchases post through. No second ledger. |
| VAT calculation (7.5%, per-line, VAT-able flag) | `packages/shared/src/vat.ts` | Yes, unchanged — Suite's invoicing uses `computeCartVat` exactly as POS's checkout does |
| Money handling (integer minor units, no floats) | `packages/shared/src/money.ts` | Yes, unchanged |
| Subscription billing engine (plans, post-paid/30-day-free, `first_use_date` anchor, grace period) | `apps/api/modules/billing` — BILL-1xx | Yes, structurally — Suite gets its **own plan tier rows** in the same `subscription_plans` table (see §9), not a new billing system |
| Super-admin panel | `apps/admin` | Yes, unchanged — one panel manages tenants and plans across both products |
| UI shell, design tokens | `packages/ui` (`AppShell`, `Surface` type) | Yes — `AppShell` already has a `'suite'` surface variant |

### 2.2 What is genuinely new for Suite

| New capability | Proposed module prefix | Rationale |
|---|---|---|
| Payroll engine (PAYE, pension, NHF, ITF, payslips) | `PAYR` | No equivalent in POS. Posts to the shared ledger; doesn't touch inventory. |
| CRM (contacts, pipeline, credit limits, retention messaging) | `CRM` | No equivalent in POS beyond a bare customer record on a sale. |
| Client invoicing (non-POS: no cart/checkout, but PO-style B2B invoices with payment terms and reminders) | `INV` | POS has a *sale* (point of purchase). Suite needs an *invoice* (issued now, paid later, chased on terms) — different lifecycle, same ledger and VAT logic underneath. |
| Nigerian business tax engine beyond VAT (WHT schedules, PAYE bands, CIT groundwork) | `TAX` | POS's Phase 6 already scopes WHT/e-invoicing groundwork; Suite is the first product that actually *needs* WHT and PAYE in the launch scope, not a later phase. |
| Lightweight, non-retail stock/asset tracking | `ASSET` (see §5 for scope decision) | Deliberately **not** a second inventory system — see below. |

### 2.3 Scope decision: Suite does not get POS's inventory engine

The original concept note described a full "Multi-Location Inventory Management" module for Suite, including batch/expiry and multi-branch stock. **This PRD scopes that down.** Inventory-POS already owns multi-unit packaging (Carton→Pack→Unit), FEFO batch/expiry, and shelf-location tracking — that machinery exists for high-volume retail trade and would be over-engineering for a consultancy tracking a handful of laptops or a clinic tracking medical supplies. Building a second inventory engine inside Suite would violate the entire shared-core rationale this monorepo exists for.

Instead, Suite ships a much smaller **`ASSET`** module: simple named items with a quantity and a location label, no unit-conversion hierarchy, no FEFO, no shelf-bin model. A healthcare or light-manufacturing tenant that genuinely needs POS-grade inventory (e.g., a clinic dispensing tracked pharmaceuticals) is a candidate for *also* running Inventory-POS's inventory module under the same tenant — the two products can share a tenant's data because they share a database — rather than Suite re-implementing it.

### 2.4 Sequencing relative to Pursberry Inventory-POS

Given a single developer building both products with AI coding agents (see prior architecture discussion), the dependency graph is:

- **Suite cannot start ahead of Pursberry Core's Phase 1** (TEN auth/RBAC, ACC ledger primitives, `pursberry-core` tenancy spine) — this is already in progress and is shared, not duplicated.
- **Suite's own build can start in parallel with POS's Phase 2 (Core POS)**, not after it — Suite's modules (`PAYR`, `CRM`, `INV`, `TAX`) touch the ledger and tenancy layer but not POS's checkout, sync engine, or hardware integration, so the two workstreams don't block each other once Phase 1 is done.
- Recommended order below (§10) assumes this parallel start; adjust if solo-dev bandwidth says otherwise.

---

## 3. Problem Statement

Nigerian SMEs outside the retail/trade vertical face the same fragmentation Inventory-POS's target market does, but with a different shape of pain:

- **Compliance load, not stock-control load.** A consultancy or agency's core operational risk is PAYE/pension/WHT miscalculation and late/incorrect filings — not stockouts or oversell.
- **CRM and finance are siloed.** Client payment history, credit terms, and outstanding invoices typically live in a different tool than the accounting records, so credit-control decisions are made blind.
- **Payroll is manual or outsourced at a cost small firms can't easily absorb.** Statutory deduction calculation (PAYE bands + Consolidated Relief Allowance, pension, NHF, ITF) is complex enough that most sub-50-employee firms either get it wrong or pay a third-party payroll bureau.
- **International tools (QuickBooks, Zoho) don't encode Nigerian tax rules at all** — the same gap Inventory-POS's problem statement identifies, just hitting a different, non-retail customer.

---

## 4. Target Users & Personas

| Persona | Context | Primary jobs-to-be-done |
|---|---|---|
| **Agency/Consultancy Owner** | 5–30 staff, project-based client billing | Issue and chase client invoices, run monthly payroll, see cash position |
| **Accountant/Bookkeeper (staff or outsourced)** | Manages books for one or several client tenants | Post/reconcile journal entries, run Trial Balance/P&L, prepare VAT/WHT filings |
| **HR/Office Manager** | Runs payroll and basic HR at a firm with no dedicated HR system | Process monthly payroll, issue payslips, track leave |
| **Sales/Account Manager** | B2B sales role at a service firm | Track pipeline, log client interactions, see a client's payment/credit history before a renewal conversation |
| **Healthcare/Clinic Administrator** | Non-retail health provider | Invoice patients/insurers, track basic supply levels (via `ASSET`, not full inventory), manage staff payroll |

---

## 5. Product Scope & Modules

### 5.1 Finance & Tax (`ACC` extensions + `TAX`)
- Income/expense tracking via the existing journal engine — no new ledger, new *entry points* into it (manual journal entry UI, bank-feed style categorization).
- **VAT:** reused from `packages/shared/src/vat.ts` unchanged.
- **WHT (Withholding Tax):** new — schedule tracking per vendor/client transaction type, WHT credit note generation. *(Not yet designed — see §11.)*
- **PAYE, pension, NHF, ITF:** new statutory calculators, detailed in §6.
- Financial reporting: Trial Balance, Balance Sheet, P&L, Cash Flow — same SQL-views-over-`journal_lines` approach as POS's Phase 4, reused directly since the underlying ledger is identical.

### 5.2 Client Invoicing & Procurement (`INV`)
- Dynamic invoice creation with payment-gateway links (Paystack/Flutterwave/bank transfer) — same gateway integrations POS's `PAY` module builds, reused for outbound client invoices rather than in-person checkout.
- Automated payment reminders, digital receipt dispatch (email/WhatsApp).
- Simple vendor bill entry (AP) for tenants who need to record supplier costs without POS's full PO→GRN→landed-cost lifecycle — a lighter-weight `INV`-side vendor bill, not a duplicate of POS's `PROC` module.

### 5.3 Payroll & HR (`PAYR`)
Detailed in §6.

### 5.4 CRM (`CRM`)
Detailed in §7.

### 5.5 Simple Assets/Stock (`ASSET`)
- Named item + quantity + free-text location, no unit-conversion hierarchy, no batch/FEFO, no shelf-bin model (see §2.3 for why).
- Low-stock threshold alert only — no reorder automation, no multi-warehouse transfer workflow.

---

## 6. Payroll & HR Module (`PAYR`)

### 6.1 Core requirements
- Employee records: bio-data, employment terms, bank details for disbursement, tax ID (TIN), pension PFA details.
- Monthly payroll run: gross salary → statutory deductions → net pay, per employee, per tenant.
- **PAYE:** graduated bands with Consolidated Relief Allowance (CRA) — `packages/shared/src/paye.ts` currently exists as an unimplemented stub (`computeMonthlyPaye` throws) precisely so this module has a home for it. Bands and CRA formula need confirming against current Finance Act rates before implementation — flagged as an open item, not assumed.
- **Pension:** 8% employee / 10% employer (statutory minimum; some employers contribute more) — `packages/shared/src/pension.ts` is the equivalent stub for this.
- **NHF:** 2.5% of basic salary.
- **ITF:** 1% of total payroll (employer-side, annual remittance, not a per-payslip deduction the same way PAYE/pension/NHF are).
- Payslip generation (digital, emailed or via self-service portal) — reuses whatever templating/PDF approach POS's receipt printing settles on where practical.
- Bank disbursement file export (format TBD — depends on which banks/payment rails the pilot tenants use).
- Leave and attendance tracking — basic, not a full HRIS.

### 6.2 Ledger integration (the part that must not be improvised)
Every payroll run is a financial event and **must** post a balanced journal entry to the same Chart of Accounts POS's sales/purchases post to — salary expense, PAYE payable, pension payable, NHF payable, net pay/bank clearing, all in one atomic transaction alongside the payslip records themselves (same "posting is a side effect, not a separate action" rule already governing POS's sales in `docs/DATA-MODEL.md`). **This mapping (which payslip line hits which GL account) is not yet designed** and is the single largest unresolved design question in this PRD — see §11.

---

## 7. CRM Module (`CRM`)

- **360° client profile:** contact history, credit limit, outstanding invoice balance, lifetime value — the credit limit and balance fields read directly from the shared ledger's AR data (via `INV`), not a duplicated balance kept in the CRM module.
- **Pipeline tracking:** lead → qualified → proposal → won/lost stages, associated to a client record.
- **Retention messaging:** SMS/WhatsApp integration for payment reminders and loyalty/promotional messages — same channel integration POS's digital-receipt dispatch would use, shared rather than rebuilt.
- Explicitly **not in scope for launch:** marketing automation sequences, lead-scoring, or third-party CRM import connectors (mirrors POS's own decision to defer named-competitor import connectors).

---

## 8. System Architecture

Suite does not introduce a new architecture — it extends the one already running for Inventory-POS.

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                       CLIENT LAYER                          │
                    │                                                             │
                    │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────┐ │
                    │ │ pos-desktop   │ │  pos-web      │ │  suite-web    │ │admin │ │
                    │ │ (Electron,    │ │ (always-      │ │ (always-      │ │(super│ │
                    │ │  offline POS) │ │  online)      │ │  online)      │ │admin)│ │
                    │ └──────┬────────┘ └──────┬────────┘ └──────┬────────┘ └──┬───┘ │
                    └────────┼──────────────────┼──────────────────┼───────────┼─────┘
                             │                  │                  │           │
                             └──────────────────┴─────────┬────────┴───────────┘
                                                           │
                    ┌──────────────────────────────────────▼──────────────────────────────────────┐
                    │                            apps/api  (ONE Express service)                    │
                    │  Auth · RBAC · tenant scoping — shared by every module below                  │
                    │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
                    │  │ POS modules │ │ ACC (ledger,│ │ PAYR       │ │ CRM        │ │ INV / TAX    │ │
                    │  │ (checkout,  │ │ shared by   │ │ (new)      │ │ (new)      │ │ (new)         │ │
                    │  │ sync, etc.) │ │ both)       │ │            │ │            │ │               │ │
                    │  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────────┘ │
                    └──────────────────────────────────────┬──────────────────────────────────────┘
                                                           │
                    ┌──────────────────────────────────────▼──────────────────────────────────────┐
                    │                                  DATA LAYER                                  │
                    │   PostgreSQL — every table (POS's and Suite's alike) carries `tenant_id`,      │
                    │   enforced via Row-Level Security. One migration history, one schema.          │
                    │   Redis — sessions, sync queue (POS), rate limiting                            │
                    └────────────────────────────────────────────────────────────────────────────────┘
```

Note what's absent: there is no second API service, no second database, and no second auth system for Suite. `suite-web` is a peer of `pos-web`, not a peer of the whole POS *product*.

---

## 9. Monetization

Suite uses the **same `subscription_plans` table and billing engine** POS's `BILL` module builds — post-paid, 30-day-free, `first_use_date`-anchored billing cycle, 7-day grace period on overage — with its own plan rows rather than a parallel billing system:

| Tier | Base Fee (proposed) | Limits | Key Features |
|---|---|---|---|
| Starter | ~$20/mo | Up to 5 employees (payroll), 50 CRM contacts | Core invoicing, basic bookkeeping, VAT |
| Growth | ~$50/mo | Up to 25 employees, unlimited CRM contacts | Full payroll (PAYE/pension/NHF), WHT tracking, CRM pipeline |
| Enterprise | Custom, ~$150+/mo | Unlimited employees/contacts | Multi-entity/branch consolidation, dedicated account management |

**Open question flagged, not decided here:** whether a tenant running *both* products pays two subscriptions or one bundled price. This has real pricing-strategy implications and belongs with the person setting commercial terms, not buried as an engineering assumption.

---

## 10. Phased Delivery Plan

Mirrors Inventory-POS's phase/sprint numbering; Suite's phases run in parallel with POS's from Phase 2 onward per §2.4.

### Phase 1 — Foundation (shared with POS, no new Suite work)
Nothing Suite-specific — this is TEN/ACC work already scoped in the Pursberry Core plan.

### Suite Phase A — Payroll Core (parallel with POS Phase 2)
- Employee records (`PAYR-101`)
- PAYE band + CRA implementation in `packages/shared/src/paye.ts` (`PAYR-102`) — **blocked on confirming current Finance Act rates (§11)**
- Pension/NHF/ITF calculators in `pension.ts` (`PAYR-103`)
- Payroll run → ledger posting integration (`PAYR-104`) — **blocked on GL mapping design (§11)**
- Payslip generation (`PAYR-105`)

### Suite Phase B — Invoicing & Tax (parallel with POS Phase 3)
- Client invoice creation + payment gateway links (`INV-101`)
- Payment reminders + digital dispatch (`INV-102`)
- Vendor bill entry, lightweight AP (`INV-103`)
- WHT schedule tracking (`TAX-101`) — **blocked on WHT rate/schedule design (§11)**

### Suite Phase C — CRM (parallel with POS Phase 4)
- Client 360° profile + AR balance integration (`CRM-101`)
- Pipeline tracking (`CRM-102`)
- Retention messaging integration (`CRM-103`)

### Suite Phase D — Simple Assets (parallel with POS Phase 5)
- `ASSET` module: item + quantity + location, low-stock alert (`ASSET-101`)

### Suite Phase E — Hardening & Rollout (aligned with POS Phase 6)
- Multi-tenant load testing across both products sharing the same database
- Pilot rollout, staff/accountant training materials
- CIT groundwork (design only — not committed for this launch)

---

## 11. Open Design Questions (do not build against these until resolved)

1. **PAYE bands and CRA formula** — needs confirming against the current Finance Act before `computeMonthlyPaye` is implemented. Building against a guessed rate table is worse than not building it yet.
2. **Payroll-to-GL account mapping** — which Chart of Accounts lines a payslip's PAYE/pension/NHF/net-pay components hit. This is an accounting design decision, not a coding one, and should be resolved (ideally with an actual accountant's input) before `PAYR-104`.
3. **WHT schedule structure** — rates vary by transaction type (rent, professional fees, contracts, etc.); needs a rate/category table design.
4. **Bundled vs. separate billing** for tenants running both products (§9).
5. **Bank disbursement file format** — depends on which banks/rails pilot tenants actually use; not worth over-engineering before the first real payroll customer.

---

## 12. Non-Functional Requirements

- **Security & compliance:** NDPA compliance (shared with POS), plus payroll/HR data carries additional sensitivity (salary, bank details, TIN) — access to `PAYR` tables should be restricted to the HR Manager/Owner roles even more tightly than general RBAC, given how sensitive compensation data is within a small firm.
- **Availability model:** unlike `pos-desktop`, `suite-web` is **always-online**, same as `pos-web` — no offline-first requirement, no local SQLite/sync engine needed for Suite.
- **Performance:** payroll runs and financial reports should complete synchronously for tenant sizes in the Starter/Growth tiers (≤25 employees); Enterprise-tier bulk runs may need a background job rather than a blocking request.

---

## 13. Success Metrics

- Time from signup to first successful payroll run (self-service, no staff assistance).
- % of invoices paid within stated terms (CRM/`INV` effectiveness proxy).
- PAYE/pension/NHF calculation accuracy vs. manual accountant recalculation on pilot tenants (this needs to be validated against real numbers before trusting the automated figures for filing).
- Tenant attach rate: what % of Inventory-POS tenants also adopt Business Suite, and vice versa — the clearest signal on whether the shared-platform bet is paying off commercially, not just architecturally.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| PAYE | Pay-As-You-Earn — Nigerian personal income tax withheld from salary |
| CRA | Consolidated Relief Allowance — statutory relief reducing PAYE-taxable income |
| WHT | Withholding Tax — advance tax deducted on certain payments (rent, professional fees, contracts) |
| NHF | National Housing Fund — 2.5% statutory salary deduction |
| ITF | Industrial Training Fund — 1% of payroll, employer-remitted |
| CIT | Company Income Tax |
| PFA | Pension Fund Administrator |
| AR / AP | Accounts Receivable / Accounts Payable |

---

*This PRD assumes and cross-references `pursberry-development-plan.md` (Inventory-POS) and `docs/DATA-MODEL.md` (shared schema rules) in the `pursberry-core` repository. Where this document is silent on a shared capability, that capability's definition lives in those files, not here.*
