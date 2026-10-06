import { Router } from 'express';
import { validateClientPatch } from '../validation.js';

/**
 * The logged-in user's own workspace (`req.workspace`, set by the auth guard):
 *   GET   /api/workspace   full workspace
 *   PATCH /api/workspace   { set, merge } patch of user-editable data (autosave)
 */
export function workspaceRoutes() {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await req.workspace.read());
  });

  router.patch('/', async (req, res) => {
    const patch = validateClientPatch(req.body);
    const ws = await req.workspace.patch(patch);
    res.json({ ok: true, updatedAt: ws.updatedAt });
  });

  return router;
}
