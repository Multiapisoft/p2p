import { PERMISSIONS } from './permissions';

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', permission: null },
  { to: '/deposits', label: 'Deposits', icon: 'south_west', permission: PERMISSIONS.DEPOSITS },
  { to: '/withdrawals', label: 'Withdrawals', icon: 'north_east', permission: PERMISSIONS.WITHDRAWALS },
  { to: '/users', label: 'Users', icon: 'group', permission: PERMISSIONS.USERS },
  { to: '/businesses', label: 'Business', icon: 'business_center', permission: PERMISSIONS.BUSINESS },
  { to: '/wallet', label: 'Wallet', icon: 'account_balance_wallet', permission: PERMISSIONS.WALLET },
  { to: '/commissions', label: 'Commissions', icon: 'percent', permission: PERMISSIONS.COMMISSIONS },
  { to: '/transactions', label: 'Ledger', icon: 'receipt_long', permission: null },
  { to: '/audit', label: 'Audit', icon: 'policy', permission: PERMISSIONS.AUDIT },
  { to: '/support', label: 'Support', icon: 'support_agent', permission: PERMISSIONS.SUPPORT },
  { to: '/settings', label: 'Settings', icon: 'settings', permission: null },
] as const;
