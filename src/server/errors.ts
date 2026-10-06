// Error with an HTTP status and a stable code the UI maps to a message.
// Kept free of Next.js imports so the worker and CLI can use it.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}
