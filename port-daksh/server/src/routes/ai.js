import { activeResumeOf, scopeToResume, stampResume } from '@waypoint/shared';
import { Router } from 'express';
import { chatReply, tasks } from '../ai/tasks.js';
import { HttpError } from '../errors.js';

const MAX_MESSAGE_CHARS = 4000;

/**
 *   POST /api/ai/:task    run one AI task against the stored workspace → { patch }
 *   POST /api/ai/chat     { message } → { patch } with the updated conversation
 *
 * The server reads the resume / jobs / profile it needs from the workspace, so the client only
 * sends ids and the few values the user just typed. The resulting patch is persisted here and
 * returned so the client applies exactly what was stored.
 *
 * Tasks see the workspace as the active resume does, and what they produce is stamped with that
 * resume: the one read before the model was called, even if the user switches meanwhile.
 */
export function aiRoutes() {
  const router = Router();

  router.post('/chat', async (req, res) => {
    const message = String(req.body?.message ?? '').trim();
    if (!message) throw new HttpError(400, 'Type a message first.');
    if (message.length > MAX_MESSAGE_CHARS) throw new HttpError(400, `Messages are limited to ${MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters.`);

    // Persist the user's turn first so it survives a failed model call (the UI keeps it on screen).
    // Appends are atomic, so quick successive messages can't overwrite each other.
    const withUser = await req.workspace.appendChat({ role: 'user', content: message });
    const reply = await chatReply(scopeToResume(withUser));
    const ws = await req.workspace.appendChat({ role: 'assistant', content: reply });
    res.json({ patch: { set: { chat: ws.chat } } });
  });

  router.post('/:task', async (req, res) => {
    const run = Object.hasOwn(tasks, req.params.task) ? tasks[req.params.task] : null;
    if (!run) throw new HttpError(404, `Unknown AI task "${req.params.task}".`);

    const ws = scopeToResume(await req.workspace.read());
    const patch = stampResume(await run(ws, req.body && typeof req.body === 'object' ? req.body : {}), activeResumeOf(ws).id);
    // The patch touches only the paths it names, so edits made while the model was thinking survive.
    await req.workspace.patch(patch);
    res.json({ patch });
  });

  return router;
}
