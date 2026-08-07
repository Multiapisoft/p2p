/** Extract API / axios error message for UI. */
export function getApiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (!err || typeof err !== 'object') return fallback;
  const ax = err as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };
  const msg = ax.response?.data?.message;
  if (Array.isArray(msg)) return msg.filter(Boolean).join(', ') || fallback;
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (typeof ax.message === 'string' && ax.message.trim()) return ax.message;
  return fallback;
}
