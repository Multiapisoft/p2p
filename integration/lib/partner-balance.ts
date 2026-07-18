export function balanceForIdentity(email: string, userId?: string | null) {
  const key = userId?.trim() || email.trim().toLowerCase();
  const hash = key.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const balance = 1000 + (hash % 5000);
  const locked = hash % 500;
  return {
    currency: 'INR' as const,
    balance,
    availableBalance: balance - locked,
    lockedBalance: locked,
  };
}
