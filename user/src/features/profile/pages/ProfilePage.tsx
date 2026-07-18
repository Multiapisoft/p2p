'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profileApi } from '../api/profile.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { formatDate } from '@/shared/lib/utils';
import { toast } from '@/shared/ui/toast/toast.store';

export function ProfilePage() {
  const authUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getMe(),
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPhone(profile.phone || '');
    }
  }, [profile]);

  const update = useMutation({
    mutationFn: () => profileApi.updateMe({ name, phone: phone || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated');
    },
    onError: () => toast.error('Could not update profile'),
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Profile</h1>
        <p className="text-sm text-on-surface-variant">Manage your account details</p>
      </div>

      <Card title="Account Info">
        <dl className="mb-4 space-y-2.5 text-sm sm:mb-6 sm:space-y-3">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
            <dt className="text-on-surface-variant">Email</dt>
            <dd className="break-all font-medium">{profile?.email ?? authUser?.email}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant">Role</dt>
            <dd className="font-medium capitalize">{profile?.role ?? authUser?.role}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant">Status</dt>
            <dd className="font-medium capitalize">{profile?.status}</dd>
          </div>
          {profile?.createdAt && (
            <div className="flex justify-between gap-2">
              <dt className="text-on-surface-variant">Member since</dt>
              <dd className="font-medium">{formatDate(profile.createdAt)}</dd>
            </div>
          )}
        </dl>

        <form
          className="space-y-4 border-t border-outline-variant pt-4 sm:pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate();
          }}
        >
          <Input label="Full Name" icon="person" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Phone" icon="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button type="submit" loading={update.isPending} className="w-full sm:w-auto">
            Save Changes
          </Button>
          {update.isSuccess && (
            <p className="text-sm text-on-secondary-container">Profile updated successfully.</p>
          )}
        </form>
      </Card>
    </div>
  );
}
