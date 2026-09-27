import { Router } from 'express';

/**
 * Pursberry Business Suite — payroll module (PAYE, pension, NHF, ITF).
 * Mount under /v1/payroll once auth + requireTenant land here, same as every
 * other tenant-facing router in this API. Tax math belongs in
 * @pursberry/shared (see paye.ts), not in this router.
 */
export const payrollRouter: Router = Router();
