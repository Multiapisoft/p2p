import { ImpersonatePage } from '@/features/auth/pages/ImpersonatePage';

export default function Page() {
  return <ImpersonatePage homePath="/home" expectedRole="user" />;
}
