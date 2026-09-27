# Pursberry Core

Shared multi-tenant backend, tenancy/RLS layer, and double-entry ledger core
for two products built and sold separately:

- **Pursberry Inventory-POS** — offline-first POS, multi-unit inventory
  (Carton → Pack → Unit), FEFO batch/expiry tracking for retail and
  wholesale MSMEs.
- **Pursberry Business Suite** — horizontal SME finance/tax, payroll/HR
  (PAYE, pension, NHF, ITF), and CRM for non-retail SMEs.

Both products share one Postgres database (tenant_id + Row-Level Security),
one auth/RBAC layer, and one accounting engine (Chart of Accounts, GL,
VAT) — see [Data model notes](docs/DATA-MODEL.md) for the two rules every
new tenant-scoped table must follow, regardless of which product it belongs
to.

- [Development plan](pursberry-development-plan.md) — architecture, scope decisions, phased delivery
- [Sprint backlog](pursberry-sprint-backlog.md) — ticket-level breakdown with acceptance criteria
- [Data model notes](docs/DATA-MODEL.md) — invariants every new table has to keep

## Layout

```
apps/
  api/         Node + Express + TypeScript. ONE backend for both products.
               Auth, RBAC, tenant scoping, /sync — modules/ holds per-product
               route groups (health, payroll, crm, and POS modules as they land).
  pos-web/     React + Vite. Inventory-POS always-online surface (WEB-101).
  suite-web/   React + Vite. Business Suite surface (finance/payroll/CRM).
  admin/       React + Vite. Super-admin panel — separate role hierarchy (BILL-102/103).
  pos-desktop/ Electron POS terminal. Offline-first, local SQLite (POS-101, SYNC-101).
packages/
  shared/      Money, packaging units, VAT, PAYE/pension (stub), tenant context.
               No I/O — pure and tested. Both products import from here.
  db/          Prisma schema, RLS policies, seed. One schema, one migration
               history, for every tenant-scoped table in either product.
  ui/          React components shared by pos-web / suite-web / admin / desktop.
```

**Why one backend for two products:** both need the same tenancy model,
the same Chart of Accounts/GL/VAT logic, and the same Nigerian compliance
rules (rates change under both products identically). Duplicating that in
two backends means fixing every tax-rule or RLS-policy bug twice and
running two databases from day one for no functional benefit. Each
product's UI, and anything genuinely product-specific (POS's shelf/batch
model, Suite's payroll/CRM), stays in its own app and its own API modules —
they don't reach into each other's tables directly.

## First run

Requires Node 22.12+ (`.nvmrc`), pnpm 10, Docker, and `psql` on PATH.

```bash
pnpm install
```

**Generate the Prisma client before doing anything else that typechecks.**
`pnpm install` does not do this automatically — the client is generated to a
custom path (`packages/db/generated/client`, gitignored on purpose since
it's generated code), and nothing hooks that into install. Skipping this is
the #1 cause of `Cannot find module '../generated/client/index.js'` on a
fresh clone or a new coding-agent session:

```bash
pnpm db:generate
```

This only reads `packages/db/prisma/schema.prisma` — no Docker or database
connection needed, so do it right after `pnpm install`, before `pnpm
typecheck`. CI runs this same step explicitly for the same reason (see
`.github/workflows/ci.yml`).

```bash
cp .env.example .env
```

Generate real secrets into `.env` before starting the API — `loadEnv()` rejects the placeholders:

```bash
printf 'JWT_ACCESS_SECRET=%s\nJWT_REFRESH_SECRET=%s\n' "$(openssl rand -base64 48)" "$(openssl rand -base64 48)"
```

Bring up Postgres and Redis:

```bash
pnpm infra:up
```

Create the app role, run migrations, apply RLS, seed:

```bash
./scripts/setup-db.sh
```

Then run whichever surface you're working on:

```bash
pnpm dev
```

| Command               | Surface                              |
| --------------------- | ------------------------------------- |
| `pnpm dev`             | API on `:4000` (shared by both products) |
| `pnpm dev:pos-web`     | Inventory-POS web app on `:5173`      |
| `pnpm dev:suite-web`   | Business Suite web app on `:5176`     |
| `pnpm dev:admin`       | Super-admin panel on `:5174`          |
| `pnpm dev:pos-desktop` | Electron POS (renderer on `:5175`)    |

Verify everything the way CI does (assumes `pnpm db:generate` has already been run — see First run above):

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Things worth knowing before you write code

**Postgres runs on 5433, not 5432.** The compose file deliberately avoids colliding with a local Postgres.app install.

**The API connects as `pursberry_app`, a non-owner role.** Row-Level Security is bypassed by superusers and by the table owner. If you point `DATABASE_URL` at the owner role, every RLS policy silently stops applying and cross-tenant reads succeed — which is exactly the failure TEN-105 exists to prevent. `DIRECT_DATABASE_URL` (owner) is only for migrations and seeding.

**Tenant-scoped queries go through `withTenant()`,** which opens a transaction and sets `app.current_tenant_id` with `SET LOCAL`. It has to be a transaction: with connection pooling a plain `SET` would leak one tenant's context onto whichever request reuses that connection next. `unscoped()` is the deliberate escape hatch and requires a written justification at the call site. This applies identically to Suite tables and POS tables.

**Money is integer minor units (kobo), never a float.** See `packages/shared/src/money.ts`. A double-entry ledger that has to balance exactly cannot tolerate `0.1 + 0.2`. Use `allocate()` / `allocateByWeights()` for splits so the parts always sum back to the whole. Payroll math (`paye.ts`, `pension.ts`) will follow the same convention once implemented.

**VAT is computed per line, never on the cart total.** Staples and fresh produce are zero-rated, so a mixed cart has no single applicable rate. The rate lives in basis points (750 = 7.5%). Both products' invoicing goes through the same `computeCartVat`.

**Every new tenant-scoped table needs three things** in the same migration: a `tenant_id` column, an entry in the array in `packages/db/prisma/sql/10_rls_policies.sql`, and an index on `tenant_id`. A table without a policy is readable across tenants. This applies to Suite's future `Employee`/`Payslip`/`CrmContact` tables exactly as it applies to POS's product/inventory tables — one schema, one rule.

**Electron: the renderer stays sandboxed.** `better-sqlite3` lives in the main process; the renderer reaches it only through named IPC channels on the `pursberry` bridge. Never expose `ipcRenderer` or a generic `invoke(channel, ...)` passthrough.

## Known gaps in this scaffold

- **No Prisma migration has been generated yet** — the schema exists but `prisma migrate dev --name init` still needs a running database. RLS policies are staged in `packages/db/prisma/sql/` rather than folded into migration files; a `prisma migrate reset` will drop them, so re-run `scripts/setup-db.sh`.
- **`authenticate` (TEN-102) returns 501 by design.** It is a hard failure rather than a permissive stub so nothing gets built against an auth layer that does not exist.
- **The Prisma schema covers the Phase 1 tenancy spine only.** Product, inventory, accounting, POS, sync and procurement models (Inventory-POS) and Employee/Payslip/CRM models (Business Suite) land with their tickets — see [docs/DATA-MODEL.md](docs/DATA-MODEL.md).
- **`packages/shared/src/paye.ts` and `pension.ts` are unimplemented stubs** — they exist so the Suite payroll module has a home for this logic in the shared package (same pattern as `vat.ts`) rather than inventing one when SUITE-1xx lands. Bands, CRA relief, and GL posting rules are not yet designed.
- **`apps/suite-web` is an empty shell** — same Vite/React scaffold as `pos-web`, no Suite-specific screens yet.
- **`better-sqlite3` is installed but not yet wired up.** Running it under Electron needs `pnpm --filter @pursberry/pos-desktop rebuild:native` first — the npm prebuild targets Node's ABI, not Electron's.
- **Plan prices are in USD.** `packages/db/prisma/seed.ts` converts at a hardcoded placeholder rate; the real NGN price list needs to replace it before BILL-101 ships.
