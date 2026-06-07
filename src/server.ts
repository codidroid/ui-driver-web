import express from 'express';
import { Session } from './session';
import { replayCase } from './replay';

export function createServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  const sessions = new Map<string, Session>();

  app.post('/session', async (req, res) => {
    const s = await Session.create({
      appUrl: req.body.appUrl ?? 'http://127.0.0.1:5173',
      browser: req.body.browser ?? 'chromium',
    });
    sessions.set(s.id, s);
    res.json({ sessionId: s.id });
  });

  app.post('/session/:sid/replay', async (req, res) => {
    const s = sessions.get(req.params.sid);
    if (!s) { res.status(404).json({ error: 'no session' }); return; }
    const report = await replayCase(s, req.body.casePath, req.body.vars ?? {});
    res.json(report);
  });

  app.delete('/session/:sid', async (req, res) => {
    const s = sessions.get(req.params.sid);
    if (!s) { res.status(404).end(); return; }
    await s.dispose();
    sessions.delete(req.params.sid);
    res.json({ ok: true });
  });

  return app;
}
