/** Error with the server's user-facing message and whether a retry is likely to help. */
export class ApiError extends Error {
  constructor(message, { status = 0, canRetry = true, code, field } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.canRetry = canRetry;
    this.code = code; // machine-readable reason, e.g. 'email_taken'
    this.field = field; // which form field the message belongs to, if any
  }
}

/** Fired when a logged-in request is rejected with 401 (the session ended); the auth provider reacts. */
export const UNAUTHORIZED_EVENT = 'waypoint:unauthorized';

async function request(method, url, body, { keepalive = false } = {}) {
  // The custom header is part of the server's CSRF defence: cross-site pages cannot add it.
  const init = { method, keepalive, headers: { 'X-Requested-With': 'waypoint' }, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body; // the browser sets the multipart boundary
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and retry.", { canRetry: true });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(e?.message || `The server returned an error (${res.status}).`, {
      status: res.status,
      canRetry: e?.canRetry ?? res.status >= 500,
      code: e?.code,
      field: e?.field,
    });
  }
  return data;
}

export const api = {
  auth: {
    me: () => request('GET', '/api/auth/me'),
    signup: (body) => request('POST', '/api/auth/signup', body),
    login: (body) => request('POST', '/api/auth/login', body),
    logout: () => request('POST', '/api/auth/logout'),
    forgotPassword: (email) => request('POST', '/api/auth/forgot-password', { email }),
    checkResetToken: (token) => request('POST', '/api/auth/reset-password/check', { token }),
    resetPassword: (token, password) => request('POST', '/api/auth/reset-password', { token, password }),
  },
  getWorkspace: () => request('GET', '/api/workspace'),
  patchWorkspace: (patch, opts) => request('PATCH', '/api/workspace', patch, opts),
  /** Run an AI task; resolves to the workspace patch the server stored. */
  runAi: (task, body = {}) => request('POST', `/api/ai/${task}`, body),
  chat: (message) => request('POST', '/api/ai/chat', { message }),
  interviews: {
    list: () => request('GET', '/api/interviews'),
    create: (body) => request('POST', '/api/interviews', body),
    get: (id) => request('GET', `/api/interviews/${encodeURIComponent(id)}`),
    /** Finish an interview that has no live connection (or whose connection can't be used). */
    end: (id) => request('POST', `/api/interviews/${encodeURIComponent(id)}/end`),
    retryReport: (id) => request('POST', `/api/interviews/${encodeURIComponent(id)}/report`),
    remove: (id) => request('DELETE', `/api/interviews/${encodeURIComponent(id)}`),
  },
  /** The voice channel of a live interview: same origin, authenticated by the session cookie. */
  liveSocketUrl: (id) => `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/live/${encodeURIComponent(id)}`,
  extractResume: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', '/api/resume/extract', form);
  },
};
