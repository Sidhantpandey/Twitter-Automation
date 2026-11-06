import 'dotenv/config';
import express from 'express';
import { APP_CONFIG } from './config/config.js';
import { startScheduler } from './utils/schedulerService.js';
import apiRoutes from './routes/apiRoutes.js';
import authRoutes from './routes/authRoutes.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  // Do not set a restrictive CSP here. Chrome DevTools probes the local OAuth endpoint
  // and a default-src 'none' policy blocks the required fetches.
  const origin = req.headers.origin;
  const allowed = APP_CONFIG.allowedOrigins;

  if (origin && (allowed.includes(origin) || origin.startsWith('chrome-extension://'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  } else if (origin && !origin.startsWith('http://127.0.0.1') && !origin.startsWith('http://localhost')) {
    return res.status(403).json({ error: 'Origin not allowed. Configure ALLOWED_ORIGINS.' });
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/',(req,res)=>{
  res.send(`Grok X Scheduler API listening at http://${APP_CONFIG.host}:${APP_CONFIG.port}`);
})
app.get('/health', (_req, res) => res.json({ ok: true, service: 'grok-x-scheduler' }));
app.use('/api', apiRoutes);
app.use('/auth', authRoutes);

app.get('/api/status', asyncRoute(async (_req, res) => {
  const { getXAccount } = await import('./utils/xService.js');
  const { getSettings } = await import('./database/db.js');
  res.json({ settings: getSettings(), xAccount: getXAccount() });
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: String(err?.message || 'Internal server error').slice(0, 1500) });
});

app.listen(APP_CONFIG.port, APP_CONFIG.host, () => {
  console.log(`Grok X Scheduler API listening at http://${APP_CONFIG.host}:${APP_CONFIG.port}`);
  startScheduler();
});
