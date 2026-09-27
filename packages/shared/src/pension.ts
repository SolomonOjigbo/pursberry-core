/**
 * Nigerian statutory pension + NHF + ITF contributions
 * (Pursberry Business Suite — payroll).
 *
 * Same placeholder status as paye.ts — rates are well-known (8% employee /
 * 10% employer pension, 2.5% NHF, 1% ITF on total payroll) but are left
 * unimplemented here until SUITE-1xx defines how they interact with the
 * ledger (which GL accounts they post to).
 */

export class PensionError extends Error {}

export function computeStatutoryDeductions(): never {
  throw new PensionError('computeStatutoryDeductions is not implemented yet — see SUITE-1xx');
}
