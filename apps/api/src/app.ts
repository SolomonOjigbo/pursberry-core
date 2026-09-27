import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { healthRouter } from './modules/health/health.routes.js';
// Suite modules mount alongside POS modules on this same Express app — one
// backend, RLS-scoped by tenant_id, shared by both products (see README).
// import { payrollRouter } from './modules/payroll/payroll.routes.js';
// import { crmRouter }     from './modules/crm/crm.routes.js';

export function createApp(): Express {
  const env = loadEnv();
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      // Explicit allowlist. The Electron POS client sends no Origin header, so
      // it is unaffected; this only constrains the browser surfaces.
      origin: [env.POS_WEB_URL, env.SUITE_WEB_URL, env.ADMIN_URL],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp({ logger }));

  app.use('/', healthRouter);

  // Tenant-facing and platform routes mount here as their tickets land:
  //   app.use('/v1/auth',      authRouter);       // TEN-102
  //   app.use('/v1/branches',  branchRouter);     // TEN-104
  //   app.use('/v1/products',  productRouter);    // PROD-101   (Inventory-POS)
  //   app.use('/v1/sync',      syncRouter);       // SYNC-103   (Inventory-POS)
  //   app.use('/v1/payroll',   payrollRouter);    // SUITE-1xx  (Business Suite)
  //   app.use('/v1/crm',       crmRouter);        // SUITE-2xx  (Business Suite)
  //   app.use('/platform',     superAdminRouter); // BILL-102/103
  // Everything under /v1 must sit behind authenticate + requireTenant, POS and
  // Suite routes alike — tenancy and RBAC are shared, not per-product.

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
