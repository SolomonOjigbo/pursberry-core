# Pursberry Business Suite — Sprint Backlog
### Ticket-level breakdown of the Business Suite PRD's Phased Delivery Plan (§10), organized by module

Ticket IDs are prefixed by module for traceability: `PAYR` (Payroll & HR), `INV` (Client Invoicing & Procurement), `TAX` (Tax engine beyond VAT), `CRM` (Customer Relationship Management), `ASSET` (Simple Assets/Stock). Suite also consumes `TEN`, `ACC`, and `BILL` tickets from the Inventory-POS backlog directly — those are **not** re-listed here; see `pursberry-sprint-backlog.md`.

Each ticket includes a one-line scope and acceptance criteria a QA pass would check against — refine estimates once sequencing against POS's own sprints is locked in (see PRD §2.4).

**Tickets marked 🚧 are blocked on an open design question from PRD §11 and should not be started until that question is resolved — don't build against a guessed rate table or an improvised GL mapping.**

---

## Phase 1 — Foundation (shared with POS — no new Suite tickets)

Suite depends on `TEN-101` through `TEN-105` and `ACC-101`/`ACC-102` from the Inventory-POS backlog. No Suite-specific work starts until those land.

---

## Suite Phase A — Payroll Core (parallel with POS Phase 2)

### Module: Payroll & HR
- **PAYR-101 — Employee record model.** `employees` table: bio-data, employment terms, bank details, TIN, PFA (pension fund administrator) details, tenant-scoped. *AC: an employee record can be created and is invisible to any tenant other than the one that created it.*
- **PAYR-102 🚧 — PAYE calculation engine.** Implement `computeMonthlyPaye` in `packages/shared/src/paye.ts` — graduated bands + Consolidated Relief Allowance (CRA). *AC: a known gross salary produces the correct PAYE figure against a hand-verified reference calculation using confirmed current Finance Act rates.* **Blocked on confirming current PAYE bands/CRA formula (PRD §11.1) — do not implement against an assumed rate table.**
- **PAYR-103 — Pension/NHF/ITF calculators.** Implement `computeStatutoryDeductions` in `packages/shared/src/pension.ts` — 8%/10% pension split, 2.5% NHF, 1% ITF. *AC: given a gross salary, employee pension, employer pension, NHF, and ITF each compute to the statutory percentage, rounded consistently with `packages/shared/src/money.ts`'s minor-unit convention.*
- **PAYR-104 🚧 — Payroll run → ledger posting.** A payroll run posts one balanced journal entry per pay period (salary expense, PAYE payable, pension payable, NHF payable, net-pay/bank-clearing) in the same transaction as the payslip records. *AC: running payroll for a pay period creates payslips and a balanced journal entry atomically — if either write fails, both roll back.* **Blocked on payroll-to-GL account mapping design (PRD §11.2) — needs accounting input before this is built, not just engineering judgment.**
- **PAYR-105 — Payslip generation.** Digital payslip per employee per pay period, emailed or available via self-service portal. *AC: a completed payroll run produces one payslip per employee reflecting the same figures as the posted journal entry.*
- **PAYR-106 — Leave & attendance tracking (basic).** Leave request/approval, attendance log — not a full HRIS. *AC: an employee's approved leave is visible to their manager and reduces their available leave balance.*
- **PAYR-107 — RBAC: HR Manager / Payroll Admin roles.** Extend the existing role set (TEN-103) with roles scoped specifically to `PAYR` tables, tighter than general staff access given salary/bank-detail sensitivity (PRD §12). *AC: a Cashier or Sales Rep role cannot read `employees` or `payslips` tables; only Owner, HR Manager, and Payroll Admin can.*

---

## Suite Phase B — Invoicing & Tax (parallel with POS Phase 3)

### Module: Client Invoicing & Procurement
- **INV-101 — Client invoice creation.** Dynamic invoice with line items, VAT applied via the shared `computeCartVat`, payment-gateway links (Paystack/Flutterwave/bank transfer — reusing POS's `PAY` integrations). *AC: an invoice with mixed VAT-able/exempt lines computes tax per line, matching POS's checkout VAT behavior exactly.*
- **INV-102 — Automated payment reminders + digital dispatch.** Email/WhatsApp dispatch on invoice issue and on configurable reminder schedule as invoices age toward/past due. *AC: an invoice past its due date triggers a reminder within the configured window without manual staff action.*
- **INV-103 — Vendor bill entry (lightweight AP).** Simple bill capture (vendor, amount, due date, category) posting to AP — deliberately not POS's full PO→GRN→landed-cost lifecycle. *AC: entering a vendor bill posts a correct AP journal entry without requiring a purchase order or goods-received step.*
- **INV-104 — Invoice → ledger posting.** Every issued invoice and recorded payment posts a balanced journal entry to the same Chart of Accounts POS's sales post to. *AC: an invoice marked paid updates AR and cash/bank accounts in one atomic transaction, visible correctly in a Trial Balance pull.*

### Module: Tax Engine
- **TAX-101 🚧 — WHT schedule tracking.** Category-based WHT rate table (rent, professional fees, contracts, etc.) applied to qualifying invoices/vendor bills. *AC: an invoice tagged with a WHT-applicable category deducts the correct rate and generates a WHT credit note.* **Blocked on WHT schedule/category design (PRD §11.3).**
- **TAX-102 — VAT filing report.** Per-tenant VAT report suitable for filing, reusing the same VAT ledger accounts POS's `POS-105`/§4.6 already establish. *AC: the VAT report total reconciles exactly against the sum of VAT postings in `journal_lines` for the filing period.*

---

## Suite Phase C — CRM (parallel with POS Phase 4)

### Module: CRM
- **CRM-101 — Client 360° profile.** Contact history, credit limit, outstanding balance, lifetime value — balance/credit fields read live from `INV`'s AR data, not a duplicated figure. *AC: a client's outstanding balance shown in their CRM profile always matches their AR balance in the ledger, with no separate stored total that can drift.*
- **CRM-102 — Pipeline tracking.** Lead → qualified → proposal → won/lost stages, linked to a client record. *AC: moving a deal to "won" is reflected in the client's profile and pipeline reporting without a separate manual update.*
- **CRM-103 — Retention messaging integration.** SMS/WhatsApp for payment reminders and promotional messages, sharing the channel integration built for `INV-102` rather than a second messaging integration. *AC: a retention message and an invoice reminder both dispatch through the same underlying channel adapter.*
- **CRM-104 — RBAC: Sales/Account Manager role.** Scoped access to CRM and read-only AR balance, without full accounting access. *AC: a Sales Rep can view a client's outstanding balance but cannot post or edit journal entries.*

---

## Suite Phase D — Simple Assets (parallel with POS Phase 5)

### Module: Simple Assets/Stock
- **ASSET-101 — Basic asset/stock record.** Named item, quantity, free-text location — explicitly no unit-conversion hierarchy, no batch/FEFO, no shelf-bin model (PRD §2.3/§5.5). *AC: an asset record can be created, quantity-adjusted, and located without any of POS's `PROD-1xx`/`PROD-2xx` packaging or batch machinery being invoked.*
- **ASSET-102 — Low-stock threshold alert.** Configurable per-item threshold triggers a dashboard notification. *AC: an item whose quantity drops below its configured threshold surfaces an alert without a scheduled reorder workflow being created (out of scope by design).*

---

## Suite Phase E — Hardening & Rollout (aligned with POS Phase 6)

### Module: Cross-Cutting
- **OPS-201 — Multi-tenant load testing across both products.** Validate that Suite's write load (payroll runs, invoicing) against the shared database doesn't degrade POS's checkout latency for tenants running both products. *AC: a simulated payroll run for a large tenant does not measurably slow POS checkout response times for a concurrent tenant on the same database.*
- **OPS-202 — Pilot rollout + accountant/staff training materials.** Onboard pilot Suite tenants, with training material specifically covering the payroll and financial-reporting modules for non-technical accounting staff. *AC: a pilot tenant's accountant can run a payroll cycle and pull a Trial Balance without engineering support.*
- **TAX-201 — CIT groundwork (design only).** Scope Company Income Tax requirements for a future phase — not committed for this launch. *AC: a design note exists covering CIT calculation requirements; no CIT code ships in this phase.*

---

## Summary: blocked tickets requiring resolution before implementation

| Ticket | Blocked on | Owner of the decision |
|---|---|---|
| PAYR-102 | Current PAYE bands + CRA formula | Needs confirming against the current Finance Act — accountant or authoritative source, not assumed |
| PAYR-104 | Payroll-to-GL account mapping | Accounting design decision — ideally with accountant input |
| TAX-101 | WHT schedule/category rate table | Same — accounting/regulatory confirmation needed |

Everything else in this backlog can be built without waiting on an external decision.
