/** Extract API / axios error message for UI. */
export function getApiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (!err || typeof err !== 'object') return fallback;

  const ax = err as {
    code?: string;
    message?: string;
    response?: {
      status?: number;
      data?: {
        message?: string | string[];
        error?: string;
        errors?: string | string[];
      };
    };
  };

  const data = ax.response?.data;
  const msg = data?.message ?? data?.error ?? data?.errors;
  if (Array.isArray(msg)) {
    const joined = msg.filter(Boolean).join(', ');
    if (joined) return joined;
  }
  if (typeof msg === 'string' && msg.trim()) return msg;

  if (!ax.response) {
    if (ax.code === 'ECONNABORTED') return 'Request timed out. Try again.';
    if (ax.message?.toLowerCase().includes('network')) {
      return 'Network error — backend unreachable. Check API / BACKEND_URL.';
    }
  }

  if (typeof ax.message === 'string' && ax.message.trim() && !ax.message.startsWith('Request failed')) {
    return ax.message;
  }

  return fallback;
}
