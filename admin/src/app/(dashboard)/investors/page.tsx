import { redirect } from 'next/navigation';

export default function InvestorsRedirect() {
  redirect('/withdrawals');
}
