'use client';

import { WithdrawalsPage } from '@/features/withdrawals/pages/WithdrawalsPage';

export function MyWithdrawalsPage() {
  return (
    <WithdrawalsPage
      origin="business"
      showCreateForm
      title="My Withdrawals"
    />
  );
}
