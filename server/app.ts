import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { apiRouter } from './routes/api.js';
import { corsOrigins } from './config.js';
import { errorHandler, notFound } from './lib/errors.js';

export function createApp() {
  const app = express();
  const webDist = path.resolve('apps/web/dist');
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
  }));
  app.use(express.json({
    limit: '256kb',
    verify(req, _res, buffer) {
      (req as express.Request).rawBody = Buffer.from(buffer);
    },
  }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    next();
  });
  app.use('/api', apiRouter);
  if (existsSync(webDist)) {
    app.use(express.static(webDist, {
      index: false,
      setHeaders(res, filePath) {
        const normalized = filePath.replaceAll('\\', '/');
        if (normalized.endsWith('/service-worker.js') || normalized.endsWith('/manifest.webmanifest')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (normalized.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/') || !req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(path.join(webDist, 'index.html'));
    });
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
