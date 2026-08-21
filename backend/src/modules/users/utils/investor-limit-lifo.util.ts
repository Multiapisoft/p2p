export interface InvestorLimitLot {
  amount: number;
  remaining: number;
  createdAt: Date | string;
}

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function investorLimitRemaining(lots: InvestorLimitLot[] | undefined | null) {
  return roundMoney(
    (lots ?? []).reduce((sum, lot) => sum + Math.max(0, Number(lot.remaining) || 0), 0),
  );
}

export function investorLimitAdded(lots: InvestorLimitLot[] | undefined | null) {
  return roundMoney(
    (lots ?? []).reduce((sum, lot) => sum + Math.max(0, Number(lot.amount) || 0), 0),
  );
}

/** Newest first — last added sits on top. */
export function investorLimitLotsLifo(lots: InvestorLimitLot[] | undefined | null) {
  return [...(lots ?? [])].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });
}

export function addInvestorLimitLot(
  lots: InvestorLimitLot[] | undefined | null,
  amount: number,
  at: Date = new Date(),
): InvestorLimitLot[] {
  const rounded = roundMoney(amount);
  if (rounded <= 0) return [...(lots ?? [])];
  return [
    ...(lots ?? []),
    { amount: rounded, remaining: rounded, createdAt: at },
  ];
}

/** Consume from the newest lot first. */
export function consumeInvestorLimitLifo(
  lots: InvestorLimitLot[] | undefined | null,
  amount: number,
): { lots: InvestorLimitLot[]; consumed: number; shortfall: number } {
  const rounded = roundMoney(amount);
  if (rounded <= 0) {
    return { lots: [...(lots ?? [])], consumed: 0, shortfall: 0 };
  }
  const next = [...(lots ?? [])].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return ta - tb;
  });
  let left = rounded;
  for (let i = next.length - 1; i >= 0 && left > 0; i--) {
    const take = Math.min(next[i].remaining, left);
    next[i] = { ...next[i], remaining: roundMoney(next[i].remaining - take) };
    left = roundMoney(left - take);
  }
  return {
    lots: next,
    consumed: roundMoney(rounded - left),
    shortfall: left,
  };
}

/** Put amount back onto newest lots (undo consume). Leftover becomes a new lot. */
export function restoreInvestorLimitLifo(
  lots: InvestorLimitLot[] | undefined | null,
  amount: number,
  at: Date = new Date(),
): InvestorLimitLot[] {
  const rounded = roundMoney(amount);
  if (rounded <= 0) return [...(lots ?? [])];
  const next = [...(lots ?? [])].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return ta - tb;
  });
  let left = rounded;
  for (let i = next.length - 1; i >= 0 && left > 0; i--) {
    const room = roundMoney(Math.max(0, next[i].amount - next[i].remaining));
    const add = Math.min(room, left);
    if (add <= 0) continue;
    next[i] = { ...next[i], remaining: roundMoney(next[i].remaining + add) };
    left = roundMoney(left - add);
  }
  if (left > 0) {
    next.push({ amount: left, remaining: left, createdAt: at });
  }
  return next;
}
