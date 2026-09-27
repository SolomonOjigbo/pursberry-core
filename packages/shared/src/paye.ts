/**
 * Nigerian PAYE (Pursberry Business Suite — payroll).
 *
 * Placeholder scaffold only: bands, reliefs (CRA) and rates are NOT yet
 * encoded — this exists so the Suite payroll module has a home for the
 * calculation that mirrors vat.ts's shape (pure, integer minor units, no I/O)
 * rather than inventing its own pattern when SUITE-1xx lands.
 */

import { type Minor } from './money.js';

export interface PayeInput {
  readonly grossMonthly: Minor;
}

export interface PayeResult {
  readonly taxable: Minor;
  readonly paye: Minor;
  readonly net: Minor;
}

export class PayeError extends Error {}

/** TODO(SUITE-1xx): implement CRA relief + graduated bands before first use. */
export function computeMonthlyPaye(_input: PayeInput): PayeResult {
  throw new PayeError('computeMonthlyPaye is not implemented yet — see SUITE-1xx');
}
