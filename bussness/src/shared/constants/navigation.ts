export interface NavItem {
  to: string;
  label: string;
  icon: string;
  description?: string;
}

/** Full sidebar navigation */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', description: 'Overview & stats' },
  { to: '/integration', label: 'Integration', icon: 'api', description: 'API keys & partner setup' },
  { to: '/users', label: 'Users', icon: 'group', description: 'Integrated users' },
  { to: '/deposits', label: 'Deposits', icon: 'south_west', description: 'Deposit activity' },
  { to: '/withdrawals', label: 'Withdrawals', icon: 'north_east', description: 'Withdrawal requests' },
  { to: '/transactions', label: 'Ledger', icon: 'receipt_long', description: 'Wallet transactions' },
  { to: '/notifications', label: 'Notifications', icon: 'notifications', description: 'Alerts' },
  { to: '/profile', label: 'Profile', icon: 'business_center', description: 'Business settings' },
  { to: '/support', label: 'Support', icon: 'support_agent', description: 'Help tickets' },
];

/** Bottom bar on mobile — primary actions */
export const MOBILE_PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'dashboard' },
  { to: '/users', label: 'Users', icon: 'group' },
  { to: '/deposits', label: 'Deposits', icon: 'south_west' },
  { to: '/withdrawals', label: 'Withdraw', icon: 'north_east' },
];

export const MOBILE_MORE_NAV: NavItem[] = [
  { to: '/integration', label: 'API', icon: 'api' },
  { to: '/transactions', label: 'Ledger', icon: 'receipt_long' },
  { to: '/notifications', label: 'Alerts', icon: 'notifications' },
  { to: '/profile', label: 'Profile', icon: 'business_center' },
  { to: '/support', label: 'Support', icon: 'support_agent' },
];

export function isNavActive(pathname: string, to: string) {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}
