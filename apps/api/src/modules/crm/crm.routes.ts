import { Router } from 'express';

/**
 * Pursberry Business Suite — CRM module (contacts, pipeline, credit limits).
 * Mount under /v1/crm once auth + requireTenant land here.
 */
export const crmRouter: Router = Router();
