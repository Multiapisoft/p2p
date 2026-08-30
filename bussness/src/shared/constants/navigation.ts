export interface NavItem {
  to: string;
  label: string;
  icon: string;
  description?: string;
}

/** Full sidebar navigation */
export const NAV_ITEMS: NavItem[] = [
  { to: '/home', label: 'Dashboard', icon: 'dashboard', description: 'Overview & stats' },
  { to: '/integration', label: 'Integration', icon: 'api', description: 'API keys & partner setup' },
  { to: '/users', label: 'Users', icon: 'group', description: 'Integrated users' },
  { to: '/deposits', label: 'Deposits', icon: 'south_west', description: 'Deposit activity' },
  { to: '/my-deposits', label: 'My Deposits', icon: 'account_balance_wallet', description: 'Pay & your deposit history' },
  { to: '/withdrawals', label: 'Withdrawals', icon: 'north_east', description: 'User withdrawal requests' },
  { to: '/my-withdrawals', label: 'My Withdrawals', icon: 'payments', description: 'Your payout requests' },
  { to: '/transactions', label: 'Ledger', icon: 'receipt_long', description: 'Wallet transactions' },
  { to: '/notifications', label: 'Notifications', icon: 'notifications', description: 'Alerts' },
  { to: '/profile', label: 'Profile', icon: 'business_center', description: 'Business settings' },
  { to: '/support', label: 'Support', icon: 'support_agent', description: 'Help tickets' },
];

/** Bottom bar on mobile — primary actions */
export const MOBILE_PRIMARY_NAV: NavItem[] = [
  { to: '/home', label: 'Home', icon: 'dashboard' },
  { to: '/users', label: 'Users', icon: 'group' },
  { to: '/deposits', label: 'Deposits', icon: 'south_west' },
  { to: '/withdrawals', label: 'Withdraw', icon: 'north_east' },
];

export const MOBILE_MORE_NAV: NavItem[] = [
  { to: '/my-deposits', label: 'My Deposits', icon: 'account_balance_wallet' },
  { to: '/my-withdrawals', label: 'My Withdraw', icon: 'payments' },
  { to: '/integration', label: 'API', icon: 'api' },
  { to: '/transactions', label: 'Ledger', icon: 'receipt_long' },
  { to: '/notifications', label: 'Alerts', icon: 'notifications' },
  { to: '/profile', label: 'Profile', icon: 'business_center' },
  { to: '/support', label: 'Support', icon: 'support_agent' },
];

export function isNavActive(pathname: string, to: string) {
  if (to === '/home') return pathname === '/home' || pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function navItemsForUser(user?: {
  staffBusinessId?: string | null;
  permissions?: string[];
} | null) {
  if (!user?.staffBusinessId) return NAV_ITEMS;
  const perms = user.permissions ?? [];
  return NAV_ITEMS.filter((item) => {
    if (item.to === '/deposits' || item.to === '/my-deposits') {
      return perms.includes('business.deposit_verify');
    }
    if (item.to === '/withdrawals' || item.to === '/my-withdrawals') {
      return (
        perms.includes('business.withdrawals') ||
        perms.includes('business.manual_withdrawal')
      );
    }
    if (item.to === '/integration') return false;
    return true;
  });
}
