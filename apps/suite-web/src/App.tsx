import { AppShell } from '@pursberry/ui';

/**
 * Pursberry Business Suite — horizontal SME product (finance/tax, payroll/HR,
 * CRM) sharing this monorepo's tenancy, ledger and auth core with the
 * Inventory-POS product. See ../../docs/DATA-MODEL.md before adding tables.
 */
export function App() {
  return (
    <AppShell surface="suite" title="Pursberry Business Suite">
      <p>Suite modules land here as their tickets are scoped (finance, payroll, CRM).</p>
    </AppShell>
  );
}
