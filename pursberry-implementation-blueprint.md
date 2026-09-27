# Pursberry Implementation Blueprint
### Master build sequence for AI coding agents (Claude Code, Devin, Windsurf, Cursor, etc.)

**Scope:** Pursberry Inventory-POS + Pursberry Business Suite + nine new modules, sequenced into three delivery phases.
**Repo:** `pursberry-core` monorepo. This document is the sequencing wrapper — it does not replace `pursberry-development-plan.md`, `pursberry-sprint-backlog.md`, the [Business Suite PRD](pursberry-business-suite-prd.md), or the [Business Suite Sprint Backlog](pursberry-business-suite-sprint-backlog.md). Where a module already has a fully-specified backlog in one of those files, this document gives you a one-line pointer and the phase it belongs in, not a duplicate copy that can drift out of sync with the original. Where a module is new, this document is its canonical specification.

---

## 0. How to use this document if you are an AI coding agent

1. **Read `README.md` and `docs/DATA-MODEL.md` in the repo root before writing any code.** They contain the invariants in §1 below in full; this section is a summary, not a replacement.
2. **Work phase by phase, module by module, ticket by ticket, in the order listed.** Tickets within a module are sequenced sensibly; tickets across modules within the same phase can generally proceed in parallel unless a dependency is called out.
3. **Never start a ticket marked 🚧.** It is blocked on a design decision that needs a human (usually an accountant or a regulatory-compliance confirmation), not more code. Building against a guessed rate table or an improvised ledger mapping is worse than not building it — see §7 for the full list.
4. **Every new tenant-scoped table needs three things in the same migration:** a `tenant_id` column, an RLS policy entry, and an index on `tenant_id`. This applies to every module in every phase below, POS's tables and Suite's tables and all nine new modules alike — there is one schema and one rule set, not one per module.
5. **Money is integer minor units, never a float.** Use `packages/shared/src/money.ts`. This applies to every new module that touches an amount — `BOOK`'s billing, `WA`'s payment links, `BANK`'s reconciliation, `FX`'s multi-currency amounts, everything.
6. **A financial event posts its ledger entry in the same transaction as the operational record**, never as a separate step. This governs every module below that touches money — POS sales, Suite payroll/invoicing, and now `BANK` reconciliation, `FX` invoicing, and `FACTOR` advances too.
7. **Don't build a second version of something that already exists.** If a new module's requirement looks like it needs its own ledger, its own auth, or its own tenancy model, that's a signal to re-read §2.1 — the answer is almost always "reuse the existing one," not "build a smaller one."

---

## 1. Shared Invariants (apply across every phase and every module)

| Invariant | Why | Source of truth |
|---|---|---|
| One Postgres database, one `tenant_id` + RLS scheme | Two tenancy models is the failure mode this whole platform exists to avoid | `packages/db/prisma/schema.prisma`, `docs/DATA-MODEL.md` |
| One double-entry ledger (Chart of Accounts, journal engine) for both products and all new modules | A tax-rule or posting-logic bug fixed once should never need fixing twice | `apps/api/src/modules/accounting` |
| One auth/RBAC system; new modules add roles, not new auth | Same reasoning | `apps/api/src/modules/(auth, tenant)` |
| One subscription billing engine; new products/tiers get new plan rows, not a new billing system | Same reasoning | `apps/api/src/modules/billing` |
| Money = integer minor units (kobo) | A ledger that must balance exactly cannot tolerate float rounding | `packages/shared/src/money.ts` |
| VAT computed per line via `computeCartVat`, never on a cart/invoice total | Mixed VAT-able/exempt lines have no single applicable rate | `packages/shared/src/vat.ts` |

### 2.1 System Architecture

One extension to the diagram already in the POS dev plan and the [Business Suite PRD](pursberry-business-suite-prd.md): the three new Phase 1 modules (`BOOK`, `WA`, `COMP`) and all Phase 2/3 modules are **cross-product API modules**, not new apps. They mount into the same `apps/api` Express service every existing module mounts into.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT LAYER                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────┐ ┌─────────────────────────┐│
│  │ pos-desktop │ │  pos-web    │ │  suite-web  │ │admin │ │ (Phase 2/3: no new apps  ││
│  │ (offline)   │ │             │ │             │ │      │ │  — features surface     ││
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──┬───┘ │  inside these four)      ││
└─────────┼───────────────┼───────────────┼───────────┼─────┴─────────────────────────┘
          └───────────────┴───────┬────────┴───────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│                          apps/api  (ONE Express service — unchanged)                │
│  Auth · RBAC · tenant scoping                                                       │
│  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌─────────┐│
│  │POS mods ││ACC/BILL ││PAYR/CRM││ BOOK    ││ WA      ││ COMP    ││(Ph.2: EINV,││(Ph.3:   ││
│  │         ││(shared) ││(Suite) ││(new)    ││(new)    ││(new)    ││BANK,FX,   ││I18N,    ││
│  │         ││         ││        ││         ││         ││         ││FACTOR)    ││NDPA)    ││
│  └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘└────────┘└─────────┘│
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│                                DATA LAYER — unchanged                              │
│           PostgreSQL, one schema, `tenant_id` + RLS on every table                   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Master Ticket Prefix Legend

| Prefix | Module | Phase | Canonical spec |
|---|---|---|---|
| `TEN` | Tenant/Platform Core | 1 | `pursberry-sprint-backlog.md` |
| `PROD` | Product/Inventory (POS) | 1 | `pursberry-sprint-backlog.md` |
| `ACC` | Accounting/Ledger (shared) | 1 (core) / 2 / 3 (extensions) | `pursberry-sprint-backlog.md` + §4, §5 below |
| `POS` | POS/Checkout | 1 | `pursberry-sprint-backlog.md` |
| `SYNC` | Offline/Sync (POS) | 1 | `pursberry-sprint-backlog.md` |
| `PROC` | Procurement/PO (POS) | 1 | `pursberry-sprint-backlog.md` |
| `PAY` | Payments (POS) | 1 | `pursberry-sprint-backlog.md` |
| `BILL` | Subscription/Billing (shared) | 1 | `pursberry-sprint-backlog.md` |
| `MIG` | Data Migration (POS) | 1 | `pursberry-sprint-backlog.md` |
| `WEB` | Web App (POS) | 1 | `pursberry-sprint-backlog.md` |
| `OPS` | Hardening/Rollout | 1 | `pursberry-sprint-backlog.md` + Suite backlog |
| `PAYR` | Payroll & HR (Suite) | 1 (core) / 2 (advances) | Suite Sprint Backlog + §4 below |
| `INV` | Client Invoicing (Suite) | 1 | Suite Sprint Backlog |
| `TAX` | Tax engine beyond VAT (Suite) | 1 | Suite Sprint Backlog |
| `CRM` | CRM (Suite) | 1 | Suite Sprint Backlog |
| `ASSET` | Simple Assets/Stock (Suite) | 1 | Suite Sprint Backlog |
| `BOOK` | Accountant/Bookkeeper Multi-Client Portal | **1 — new** | §3.3 below |
| `WA` | WhatsApp-Native Invoicing & Payment | **1 — new** | §3.4 below |
| `COMP` | Compliance Calendar | **1 — new** | §3.5 below |
| `EINV` | NRS E-Invoicing / Merchant Buyer Solution | **2 — new** | §4.1 below |
| `BANK` | Open Banking Reconciliation | **2 — new** | §4.2 below |
| `FX` | Multi-Currency Invoicing | **2 — new** | §4.3 below |
| `FACTOR` | Invoice-Backed Early Payment | **2 — new** | §4.4 below |
| `I18N` | Localization | **3 — new** | §5.1 below |
| `NDPA` | Data-Subject Request Tooling | **3 — new** | §5.2 below |

---

## 3. Phase 1 — MVP / Proof of Concept

Everything a tenant needs for a working, sellable product on day one: both products' full existing scope, plus the three additions the business decided belong in the MVP rather than later.

### 3.1 Shared Foundation (`TEN`, core `ACC`, `BILL`)

No new tickets — this is `pursberry-sprint-backlog.md` Phase 1 (`TEN-101`–`TEN-105`, `ACC-101`–`ACC-102`, `BILL-101`–`BILL-104`). Both products and all Phase 1 new modules depend on this being done first.

### 3.2 Pursberry Inventory-POS

Full scope, unchanged from `pursberry-development-plan.md` and `pursberry-sprint-backlog.md`:

| Module | Ticket range | What it covers |
|---|---|---|
| POS/Checkout | `POS-101`–`POS-106` | Electron shell, barcode checkout, multi-payment split, shelf-aware stock deduction, VAT, hardware |
| Offline/Sync | `SYNC-101`–`SYNC-105` | SQLite local store, outbox pattern, idempotent replay, conflict resolution |
| Payments | `PAY-101`–`PAY-102` | Moniepoint, Paystack |
| Product/Inventory | `PROD-101`–`PROD-103`, `PROD-201`–`PROD-205` | Multi-unit packaging, shelf locations, batch/FEFO, transfers, costing method |
| Procurement/PO | `PROC-101`–`PROC-104` | Vendor management, PO lifecycle, GRN, landed cost |
| Data Migration | `MIG-101`–`MIG-102`, `TEN-201`–`TEN-202` | CSV/Excel import, onboarding wizard |
| Accounting reporting | `ACC-201`–`ACC-208` | Trial Balance, GL, Balance Sheet, P&L, Cash Flow, AR/AP, VAT report |
| Web App | `WEB-101`–`WEB-102` | Always-online web build, remote reporting dashboard |
| Sync/Backup | `SYNC-201`–`SYNC-202` | Cloud backup/restore for Electron installs |
| Hardening/Rollout | `OPS-101`–`OPS-105`, `BILL-201`–`BILL-206` | Load testing, pilot rollout, billing finalization |

Full acceptance criteria for every ticket above: `pursberry-sprint-backlog.md`.

### 3.3 Pursberry Business Suite

Full scope, unchanged from the [Business Suite PRD](pursberry-business-suite-prd.md) and [Sprint Backlog](pursberry-business-suite-sprint-backlog.md):

| Module | Ticket range | What it covers |
|---|---|---|
| Payroll & HR | `PAYR-101`–`PAYR-107` | Employee records, PAYE 🚧, pension/NHF/ITF, ledger posting 🚧, payslips, leave, RBAC |
| Client Invoicing | `INV-101`–`INV-104` | Invoice creation, reminders, vendor bills, ledger posting |
| Tax Engine | `TAX-101` 🚧, `TAX-102` | WHT tracking, VAT filing report |
| CRM | `CRM-101`–`CRM-104` | Client profile, pipeline, retention messaging, RBAC |
| Simple Assets | `ASSET-101`–`ASSET-102` | Lightweight item/quantity/location tracking (deliberately not POS's inventory engine) |
| Hardening | `OPS-201`–`OPS-202`, `TAX-201` | Cross-product load testing, pilot rollout, CIT groundwork (design-only) |

Full acceptance criteria for every ticket above, and the three 🚧-blocked items' details: [Business Suite Sprint Backlog](pursberry-business-suite-sprint-backlog.md).

### 3.4 NEW — Accountant/Bookkeeper Multi-Client Portal (`BOOK`)

**Where this lives in the repo:** `apps/api/src/modules/book/` (new), consumed by a new panel inside `apps/suite-web` (an accountant is a *user type*, not a new app — no `apps/book-web`). Depends on `TEN-102`/`TEN-103` (auth/RBAC) and reads from both products' data, so it cannot start before Phase 1's shared foundation is done.

**Why it's in the MVP, not later:** a large share of target tenants already outsource bookkeeping to an external accountant. That accountant is a distribution channel — the portal is what turns "one accountant, one client" into "one accountant recommending Pursberry to every client they take on."

- **BOOK-101 — Accountant account type & cross-tenant access-grant model.** An accountant is not a `Membership` row scoped to one tenant — model a separate grant (`accountant_tenant_grants`: accountant user, tenant, access level, granted-by, granted-at, revoked-at) that RLS-respects tenant isolation rather than bypassing it. *AC: an accountant can query only tenants with an active, non-revoked grant; a revoked grant immediately removes visibility on the next request, no caching lag.*
- **BOOK-102 — Client invitation & access-grant flow.** Tenant owner invites an accountant by email; accountant accepts; access level (read-only reports vs. full bookkeeping write access) is set at invitation time and editable after. *AC: an invited accountant appears in the tenant's "connected accountants" list only after they accept — a pending invitation is visibly distinct from an active grant.*
- **BOOK-103 — Multi-client dashboard/switcher UI.** Accountant-side view listing every connected client tenant with a quick-switch control and a cross-client to-do surface (e.g. "3 clients have unreconciled items"). *AC: switching the active client in the UI updates all tenant-scoped views without a full re-login or page reload.*
- **BOOK-104 — Cross-client bulk actions.** Start with one action — generate the VAT filing report (`TAX-102`) for every client due in the current period, in one action. *AC: a bulk "generate VAT report" action produces one correctly-scoped report per client tenant, not one report mixing multiple tenants' data.*
- **BOOK-105 — Accountant activity audit log.** Tenant owner can see what an accountant viewed or edited on their books. *AC: a tenant owner can view a chronological log of an accountant's actions scoped to their tenant only.*
- **BOOK-106 — RBAC: access-level enforcement.** Read-only grants cannot post journal entries or edit records; full-access grants can, within the same permission boundaries a tenant's own Accountant role has. *AC: an accountant with a read-only grant on Client A gets a 403 attempting to post a journal entry on Client A's books, even if they hold a full-access grant on Client B.*

### 3.5 NEW — WhatsApp-Native Invoicing & Payment (`WA`)

**Where this lives in the repo:** `apps/api/src/modules/whatsapp/` (new) — a shared channel adapter consumed by `INV-102`/`CRM-103`'s existing "digital dispatch" requirement (formalizing it into its own module rather than leaving it as an assumption inside those tickets) and by POS's digital-receipt dispatch. Depends on `INV-101` (invoice creation) and `PAY-102`/Suite's payment-gateway integration for the payment-link piece.

- **WA-101 — WhatsApp Business API integration (shared channel adapter).** Base send/receive/delivery-status integration, built once and reused by every module that dispatches a WhatsApp message. *AC: a message can be sent to a client's WhatsApp number from the platform and its delivery status (sent/delivered/read/failed) is tracked per message.*
- **WA-102 — Invoice delivery via WhatsApp with inline payment link.** Issuing an invoice (`INV-101`) sends a WhatsApp message with an invoice summary and a tokenized payment link. *AC: a client can open the payment link from the WhatsApp message and reach a working payment flow without a separate account/login.*
- **WA-103 — Payment confirmation round-trip.** On successful payment via the link, a confirmation message returns via WhatsApp and the invoice's status updates. *AC: paying via the WhatsApp-delivered link marks the invoice paid and posts the ledger entry atomically, per `INV-104`'s existing atomicity rule — this ticket is a new *trigger* into that existing posting logic, not a second posting path.*
- **WA-104 — Reminder scheduling.** Formalizes `INV-102`/`CRM-103`'s reminder requirement onto this shared channel adapter. *AC: an overdue invoice triggers a scheduled WhatsApp reminder per tenant-configured cadence, using `WA-101`'s adapter rather than a separate integration.*
- **WA-105 — Two-way reply routing (basic tenant inbox).** A client's WhatsApp reply surfaces in a simple tenant-facing log linked to the relevant invoice/client record, rather than disappearing. *AC: a client's reply to an invoice message appears in the tenant's message log, correctly linked to that invoice.*
- **WA-106 — Consent/opt-in tracking (NDPA-aware).** Track and enforce a client's consent to receive WhatsApp messages; respect opt-out immediately. *AC: a client who has not opted in receives no WhatsApp dispatch; an opt-out request stops all further messages to that client from the next send onward.*

### 3.6 NEW — Compliance Calendar (`COMP`)

**Where this lives in the repo:** `apps/api/src/modules/compliance/` (new) — cross-product, surfaces inside both `pos-web`/`pos-desktop` (VAT, CAC) and `suite-web` (VAT, WHT, PAYE, pension, NHF, ITF, CAC). Depends on `TEN-104` (tenant/branch setup) for applicability logic and `WA-101` for the notification channel (reused, not rebuilt).

- **COMP-101 — Compliance deadline data model.** `compliance_deadlines`: deadline type (VAT filing, CAC annual return, PAYE remittance, pension remittance, NHF, ITF, WHT), recurrence rule, per-tenant applicability flag. *AC: a tenant sees only deadline types relevant to the modules they actually have active — a pure Inventory-POS tenant with no payroll module doesn't see PAYE deadlines.*
- **COMP-102 — Auto-assignment engine.** Populate a tenant's calendar automatically based on registration date and which modules/products they've activated (e.g. activating `PAYR` auto-adds PAYE/pension/NHF/ITF deadlines). *AC: enabling the Payroll module for a tenant adds the correct statutory deadlines to their calendar without manual setup by staff or the tenant.*
- **COMP-103 — Notification/reminder engine.** Reuses `WA-101`'s channel adapter plus email, at configurable lead times (e.g. 7 days, 1 day before). *AC: a tenant receives a reminder at each configured lead time before a deadline, through both channels if both are enabled.*
- **COMP-104 — Deadline completion tracking.** Tenant marks a deadline filed/completed; unmarked items past their date are visually flagged overdue. *AC: a deadline with no completion marked, past its due date, displays as overdue on the tenant's dashboard.*
- **COMP-105 — Super-admin aggregate view.** Platform-wide count of overdue compliance items across tenants, for support prioritization — not tenant-facing. *AC: a super-admin can see how many tenants platform-wide currently have at least one overdue compliance item.*

### 3.7 Phase 1 exit criteria

Both products' `OPS`/hardening tickets pass, plus: `BOOK-101`–`BOOK-106`, `WA-101`–`WA-106`, and `COMP-101`–`COMP-105` all pass their AC, and at least one pilot tenant has used the accountant portal, received one WhatsApp-delivered invoice payment, and had one compliance deadline correctly auto-populated and reminded on.

---

## 4. Phase 2 — Growth Features

Everything from the high-value feature brainstorm not already assigned to Phase 1. **One sequencing note before the tickets:** the NRS Merchant Buyer Solution e-invoicing mandate is already live for large taxpayers, went live for medium taxpayers (₦1–5bn turnover) on 1 July 2026 with enforcement from January 2027, and is scheduled to reach small/emerging taxpayers in 2027. That's a real deadline sitting inside a phase with no fixed date. Recommend treating `EINV` as the first module built within Phase 2, not the last, even though it's grouped here per the phase-1/phase-2 split as instructed.

### 4.1 NEW — NRS E-Invoicing / Merchant Buyer Solution (`EINV`)

**Where this lives:** `apps/api/src/modules/einvoicing/` — cross-product, consuming both POS's `sales_orders` and Suite's `invoices`.

- **EINV-101 — Access Point Provider (APP) selection.** Evaluate NRS-approved Access Point Providers/System Integrators for structured invoice transmission (UBL/PEPPOL standards). *AC: a decision record names the chosen APP/SI integration path before any transmission code is written.*
- **EINV-102 — Structured invoice generation (UBL format).** Generate invoices in NRS's required structured format from existing sale/invoice records. *AC: a POS sale or Suite invoice generates a valid UBL-format document without manual reformatting.*
- **EINV-103 — Real-time transmission & validation.** Submit structured invoices via the chosen APP for pre-clearance/validation per the four-party MBS model (seller, buyer, NRS, APP). *AC: an invoice is validated and digitally signed by NRS before being finalized to the buyer.*
- **EINV-104 — Compliance status tracking per invoice.** Track transmission status (pending/validated/rejected) visibly. *AC: a rejected invoice surfaces its rejection reason and blocks finalization until corrected.*
- **EINV-105 — Tenant eligibility/threshold detection.** Auto-detect which tenants are currently in-scope by turnover band, since the mandate phases in over time. *AC: a tenant below the current mandatory threshold is not forced through e-invoicing but can opt in.*

### 4.2 NEW — Open Banking Reconciliation (`BANK`)

**Where this lives:** `apps/api/src/modules/banking/` — cross-product.

- **BANK-101 — Mono/Okra account-linking flow.** Tenant connects a bank account via the aggregator's consent flow. *AC: a linked account's transaction feed becomes visible within the platform.*
- **BANK-102 — Transaction feed ingestion.** Pull and store transactions, tenant-scoped. *AC: new transactions appear within the aggregator's normal sync latency.*
- **BANK-103 — Auto-reconciliation matching engine.** Match bank transactions against open invoices/vendor bills. *AC: a transaction matching an outstanding invoice's amount and reference auto-suggests a match for staff confirmation.*
- **BANK-104 — Manual match/override UI.** For transactions the engine can't confidently match. *AC: an unmatched transaction surfaces in a review queue.*
- **BANK-105 — Reconciliation → ledger posting.** Same atomicity rule as `INV-104`/`PAYR-104`. *AC: confirming a match posts a balanced journal entry in the same transaction as the confirmation.*

### 4.3 NEW — Multi-Currency Invoicing (`FX`, extends `INV`)

- **FX-101 — Multi-currency invoice line items.** Invoice issuable in a currency other than NGN. *AC: an invoice can be created and displayed in a foreign currency alongside its NGN-equivalent at issue.*
- **FX-102 — FX-rate locking at issue time.** Store the rate used at creation; never recompute against a later rate. *AC: an invoice's NGN-equivalent doesn't change on later lookup after the market rate has moved.*
- **FX-103 — FX-rate source integration.** Pull from a reliable source (CBN official rate or a commercial FX API) rather than manual entry. *AC: a new invoice's locked rate matches the source's rate at creation time, within an agreed tolerance.*
- **FX-104 — Multi-currency ledger posting.** Journal entries carry both original-currency and NGN-equivalent amounts. *AC: a Trial Balance pull correctly totals NGN-equivalent values for a tenant with mixed-currency invoices.*

### 4.4 NEW — Invoice-Backed Early Payment (`FACTOR`)

- **FACTOR-101 — Partner selection.** Identify a factoring/embedded-finance partner API rather than building underwriting in-house. *AC: a decision record names the chosen partner before integration work starts.*
- **FACTOR-102 — "Get paid now" offer surface.** Show an eligible invoice's early-payment offer, fee itemized. *AC: an eligible invoice displays the fee-adjusted offer before the tenant accepts.*
- **FACTOR-103 — Partner API integration.** Advance disbursement and repayment tracking. *AC: accepting an offer disburses the advance and correctly tracks settlement against the partner, without double-counting revenue.*
- **FACTOR-104 🚧 — Ledger treatment for factored invoices.** Factoring fee as an expense, advance as a liability until settled. *AC: a factored invoice's journal entries correctly separate the fee from original invoice revenue.* **Blocked — needs accountant input on correct treatment before implementation, same category as `PAYR-104`/`TAX-101`.**

### 4.5 Payroll Advance Tracking (extends `PAYR`)

- **PAYR-201 — Salary advance request & approval.** Employee/HR-initiated, linked to a specific future pay period. *AC: an approved advance is recorded and linked to the pay period it will be deducted from.*
- **PAYR-202 — Automatic deduction on next payroll run.** *AC: a payroll run for an employee with an outstanding advance deducts the correct remaining balance automatically.*
- **PAYR-203 — Advance ledger posting.** Disbursement and repayment post correctly (receivable from employee, cleared on repayment). *AC: an advance's ledger balance matches the sum of undeducted amounts across affected employees.*

### 4.6 Lender/Grant-Readiness Export (extends `ACC`)

- **ACC-401 — Lender-ready financial statement export.** One document bundling Trial Balance, P&L, Balance Sheet, Cash Flow for a selected period. *AC: the export is a single document with all four statements, correctly labeled with the tenant's registered business name.*
- **ACC-402 — Multi-period comparison.** Show several prior periods side-by-side, as loan applications typically require. *AC: an export can display a specified number of prior periods alongside the current one.*

---

## 5. Phase 3 — Low Priority / Future

Directional specs — expect these to need re-scoping closer to build time rather than being build-ready as written.

### 5.1 NEW — Localization (`I18N`)

- **I18N-101 — UI string extraction & translation infrastructure.** *AC: all user-facing strings are extracted to translation files with a working English baseline before any non-English translation begins.*
- **I18N-102 — Pidgin translation.** *AC: switching language to Pidgin renders translated strings correctly across core screens.*
- **I18N-103 — Yoruba/Hausa/Igbo translations.** *AC: same as I18N-102, per language.*

### 5.2 NEW — NDPA Data-Subject Request Tooling (`NDPA`)

- **NDPA-101 — DSAR intake & tracking.** *AC: a data-subject access request can be logged, tracked to completion, with a due-date reminder.*
- **NDPA-102 — Export/deletion tooling per data subject.** *AC: a valid request can produce a data export or execute deletion, subject to a review/approval step before execution.*

### 5.3 Multi-Branch Consolidated Reporting — Suite (extends `ACC`)

- **ACC-501 — Cross-branch consolidated P&L for multi-location Suite tenants.** *AC: a tenant with several branches sees one consolidated P&L alongside per-branch breakdowns.*

### 5.4 Carried forward, no new tickets needed

- **`TAX-201` (CIT groundwork)** — already scoped as design-only in the [Business Suite Sprint Backlog](pursberry-business-suite-sprint-backlog.md); stays in Phase 3 by nature, not duplicated here.

---

## 6. Blocked Tickets — Master List (do not start until resolved)

| Ticket | Phase | Blocked on | Decision owner |
|---|---|---|---|
| `PAYR-102` | 1 | Current PAYE bands + CRA formula | Confirm against current Finance Act — accountant or authoritative source |
| `PAYR-104` | 1 | Payroll-to-GL account mapping | Accounting design decision, ideally with accountant input |
| `TAX-101` | 1 | WHT schedule/category rate table | Accounting/regulatory confirmation |
| `FACTOR-104` | 2 | Ledger treatment for factored invoices | Accounting design decision |

Every other ticket across all three phases can be built without waiting on an external decision.
