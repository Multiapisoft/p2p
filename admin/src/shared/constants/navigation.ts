import { PERMISSIONS } from './permissions';

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', permission: null },
  { to: '/deposits', label: 'Deposits', icon: 'south_west', permission: PERMISSIONS.DEPOSITS },
  { to: '/my-deposits', label: 'My Deposits', icon: 'account_balance_wallet', permission: PERMISSIONS.DEPOSITS },
  { to: '/withdrawals', label: 'Withdrawals', icon: 'north_east', permission: PERMISSIONS.WITHDRAWALS },
  { to: '/my-withdrawals', label: 'My Withdrawals', icon: 'payments', permission: PERMISSIONS.WITHDRAWALS },
  { to: '/users', label: 'Users', icon: 'group', permission: PERMISSIONS.USERS },
  { to: '/businesses', label: 'Business', icon: 'business_center', permission: PERMISSIONS.BUSINESS },
  { to: '/wallet', label: 'Wallet', icon: 'account_balance_wallet', permission: PERMISSIONS.WALLET },
  { to: '/commissions', label: 'Commissions', icon: 'percent', permission: PERMISSIONS.COMMISSIONS },
  { to: '/my-ledger', label: 'My Ledger', icon: 'menu_book', permission: null },
  { to: '/transactions', label: 'Transactions', icon: 'receipt_long', permission: null },
  { to: '/audit', label: 'Audit', icon: 'policy', permission: PERMISSIONS.AUDIT },
  { to: '/support', label: 'Support', icon: 'support_agent', permission: PERMISSIONS.SUPPORT },
  { to: '/settings', label: 'Settings', icon: 'settings', permission: null },
] as const;
