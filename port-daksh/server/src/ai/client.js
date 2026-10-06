import { ApiError, GoogleGenAI } from '@google/genai';
import { getConfig } from '../config.js';
import { HttpError } from '../errors.js';

/**
 * The only module that talks to the Gemini API.
 *
 *  - `transport` turns (system, messages, maxTokens) into the model's text reply and maps every SDK
 *    failure to a user-safe HttpError. Tests replace it with `setTransport` so the whole pipeline
 *    (routes → prompts → parsing → persistence) can run without a key.
 *  - `completeJson` / `completeText` build on top of it.
 */

// Rules shared by every analysis task (ported from the design prototype).
export const SYSTEM_PROMPT =
  'You are the analysis engine of a career intelligence platform. Rules: Use only facts present in the provided resume, profile and job text. Never invent experience, employers, titles, technologies, certifications, achievements or metrics. Distinguish facts from suggestions. Scores are calibrated estimates, not generous. Never accuse anyone of lying, and never declare a job definitely a scam. Respond with ONE JSON object only, no prose, no markdown fences.';

const MAX_OUTPUT_TOKENS = 65_000; // gemini-2.5-flash-lite allows 65,536
const JSON_TEMPERATURE = 0.3; // analysis should be consistent run to run
const CHAT_TEMPERATURE = 0.7;
// Transient failures are retried by the SDK with backoff. 429 is deliberately not retried: the user should wait.
const RETRY = { attempts: 3, initialDelay: 1, maxDelay: 8, httpStatusCodes: [408, 500, 502, 503, 504] };
// Finish reasons meaning the model (or its safety filters) refused to answer.
const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT']);

const notConfigured = () =>
  new HttpError(503, "The AI service isn't configured. Set GEMINI_API_KEY in server/.env and restart the server.", { canRetry: false });
const declined = () => new HttpError(502, 'The AI declined to process this request. Try rephrasing or shortening the text.', { canRetry: false });

let client = null;
let clientKey = null;
let injected = null;

/** Test hook: use a fake `GoogleGenAI`-shaped client. Pass nothing to restore the real one. */
export const setGeminiClient = (fake) => {
  injected = fake || null;
};

function getClient() {
  if (injected) return injected;
  const { apiKey, timeoutMs } = getConfig().ai;
  if (!apiKey) throw notConfigured();
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs, retryOptions: RETRY } });
    clientKey = apiKey;
  }
  return client;
}

/** Chat turns → Gemini `contents`: roles are user/model, and consecutive turns of one role are merged. */
export function toContents(messages) {
  const contents = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents.at(-1);
    if (last?.role === role) last.parts.push({ text: m.content });
    else contents.push({ role, parts: [{ text: m.content }] });
  }
  return contents;
}

/** Pull the answer text out of a response, turning blocks and truncation into errors. */
export function extractText(res) {
  if (res.promptFeedback?.blockReason) throw declined();
  const candidate = res.candidates?.[0];
  if (!candidate) throw new Error('empty'); // no candidates and no block reason: treated as an unreadable reply
  if (BLOCKED_FINISH.has(candidate.finishReason)) throw declined();

  const text = (candidate.content?.parts || [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  if (candidate.finishReason === 'MAX_TOKENS') {
    const err = new Error('truncated');
    err.truncated = true;
    err.partial = text;
    throw err;
  }
  return text;
}

/** Translate any SDK / network failure into an HttpError the UI can display. */
export function toHttpError(err, fallbackMessage = 'The AI service returned an error. Try again.') {
  if (err instanceof HttpError) return err;
  const detail = String(err?.message || '');

  if (err instanceof ApiError) {
    const status = err.status;
    if (status === 429) return new HttpError(429, 'Rate limit reached. Wait a minute and retry.');
    if (status === 400 && /api key not valid|API_KEY_INVALID|api key expired/i.test(detail)) {
      return new HttpError(503, "The AI service rejected this server's API key. Check GEMINI_API_KEY in server/.env.", { canRetry: false });
    }
    if (status === 401 || status === 403) {
      return new HttpError(503, "The AI service rejected this server's API key or it lacks access. Check GEMINI_API_KEY in server/.env.", { canRetry: false });
    }
    if (status === 404) {
      return new HttpError(503, `The model "${getConfig().ai.model}" isn't available for this API key. Check GEMINI_MODEL in server/.env.`, { canRetry: false });
    }
    if (status === 400 && /location is not supported/i.test(detail)) {
      return new HttpError(503, "The Gemini API isn't available from this region.", { canRetry: false });
    }
    if (status === 408 || status >= 500) return new HttpError(502, 'The AI service is busy right now. Try again in a moment.');
    console.error(`[ai] request rejected (${status}):`, detail.slice(0, 300));
    return new HttpError(502, fallbackMessage);
  }
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || /timed? ?out|aborted/i.test(detail)) {
    return new HttpError(504, 'The request timed out. Try again, or shorten the text.');
  }
  if (err?.name === 'TypeError' || /fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|network/i.test(detail)) {
    return new HttpError(502, "Couldn't reach the AI service. Check the server's network connection and retry.");
  }
  console.error('[ai] unexpected failure:', err);
  return new HttpError(502, fallbackMessage);
}

async function geminiTransport({ system, messages, maxTokens, json = false, temperature, errorMessage }) {
  const { model } = getConfig().ai;
  try {
    const res = await getClient().models.generateContent({
      model,
      contents: toContents(messages),
      config: {
        systemInstruction: system,
        maxOutputTokens: Math.min(MAX_OUTPUT_TOKENS, maxTokens + 1000),
        temperature: temperature ?? (json ? JSON_TEMPERATURE : CHAT_TEMPERATURE),
        // JSON mode makes the model emit a single valid JSON document (no prose, no fences).
        ...(json ? { responseMimeType: 'application/json' } : null),
      },
    });
    return extractText(res);
  } catch (err) {
    if (err.truncated || err.message === 'empty') throw err;
    throw toHttpError(err, errorMessage);
  }
}

let transport = geminiTransport;
/** Test hook: replace the model transport. Pass nothing to restore the real one. */
export const setTransport = (fn) => {
  transport = fn || geminiTransport;
};

function parseJson(text) {
  const t = String(text || '').replace(/```json|```/g, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('bad-json');
  return JSON.parse(t.slice(a, b + 1));
}

/**
 * Ask for one JSON object. A malformed, empty or truncated reply is retried once (with more room if it
 * was cut off); transport failures are not retried here — the SDK already retries transient errors.
 */
export async function completeJson(prompt, maxTokens = 2500) {
  let budget = maxTokens;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await transport({ system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }], maxTokens: budget, json: true });
      return parseJson(text);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err.truncated) budget = Math.round(budget * 1.5);
      else if (err.message !== 'bad-json' && err.message !== 'empty' && !(err instanceof SyntaxError)) throw toHttpError(err);
    }
  }
  throw new HttpError(502, "The AI returned a response we couldn't read. Retry usually fixes this.");
}

/** Free-text reply for the assistant chat. */
export async function completeText({ system, messages, maxTokens = 900 }) {
  const errorMessage = "The assistant couldn't respond. Try again.";
  try {
    const text = String(await transport({ system, messages, maxTokens, json: false, errorMessage })).trim();
    if (!text) throw new HttpError(502, errorMessage);
    return text;
  } catch (err) {
    if (err.truncated) {
      // A chat reply cut off at the token limit is still useful; only an empty one is an error.
      const partial = String(err.partial || '').trim();
      if (partial) return partial;
      throw new HttpError(502, errorMessage);
    }
    if (err.message === 'empty') throw new HttpError(502, errorMessage);
    throw err instanceof HttpError ? err : toHttpError(err, errorMessage);
  }
}
