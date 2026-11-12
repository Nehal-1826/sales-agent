/**
 * ``extractErrorMessage(err, fallback)`` — pull a human-readable string out
 * of whatever the network layer threw. Eliminates "Something went wrong"
 * toasts: when the backend returns a structured ``{detail: "…"}`` we show
 * that verbatim, otherwise we fall back to the caller's default copy.
 *
 * The hierarchy:
 *   1. ``err.response.data.detail`` — FastAPI's standard error envelope.
 *   2. ``err.response.data.message`` — older / hand-rolled handlers.
 *   3. ``err.response.data`` if it's a string.
 *   4. ``err.message`` — last-resort axios timeout / network errors.
 *   5. The fallback the caller passed.
 */
import { AxiosError } from 'axios';

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data && typeof data === 'object') {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === 'string' && detail.trim().length > 0) {
        return detail;
      }
      const message = (data as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
    if (typeof data === 'string' && data.trim().length > 0) {
      return data;
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
