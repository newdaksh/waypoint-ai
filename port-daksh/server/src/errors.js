/**
 * An error that is safe to show to the user. `canRetry` tells the UI whether a "Retry" button makes sense
 * (true for transient upstream failures, false for validation problems the user must fix first).
 */
export class HttpError extends Error {
  constructor(status, message, { canRetry, code, field } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code; // machine-readable reason, e.g. 'email_taken'
    this.field = field; // form field the message belongs to, when there is one
    this.canRetry = canRetry ?? (status >= 500 || status === 429);
  }
}
