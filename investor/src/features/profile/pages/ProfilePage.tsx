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
import { normalizePhone, phoneError } from '@/shared/lib/validation';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getMe(),
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  const update = useMutation({
    mutationFn: () =>
      profileApi.updateMe({
        name,
        phone: phone.trim() ? normalizePhone(phone) : undefined,
      }),
    onSuccess: () => {
      setMessage('Profile updated successfully');
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: () => setMessage('Failed to update profile'),
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold">Profile</h1>
        <p className="text-on-surface-variant">Manage your account details</p>
      </div>

      <Card title="Account Info">
        <div className="mb-6 space-y-3 rounded-lg bg-surface-container-low p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Email</span>
            <span className="font-medium">{profile?.email ?? user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Role</span>
            <span className="font-medium capitalize">{profile?.role ?? user?.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Status</span>
            <span className="font-medium capitalize">{profile?.status}</span>
          </div>
          {profile?.createdAt && (
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Member since</span>
              <span className="font-medium">{formatDate(profile.createdAt)}</span>
            </div>
          )}
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage('');
            const pMsg = phoneError(phone, false);
            if (pMsg) {
              setMessage(pMsg);
              return;
            }
            update.mutate();
          }}
        >
          <Input label="Full Name" icon="person" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input
            label="Phone"
            icon="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile"
            inputMode="numeric"
            maxLength={13}
          />

          {message && (
            <p
              className={`text-sm ${message.includes('success') ? 'text-on-secondary-container' : 'text-error'}`}
            >
              {message}
            </p>
          )}

          <Button type="submit" loading={update.isPending}>
            Save Changes
          </Button>
        </form>
      </Card>

      <Card>
        <Button variant="danger" className="w-full" onClick={() => logout()}>
          <span className="material-symbols-outlined text-lg">logout</span>
          Logout
        </Button>
      </Card>
    </div>
  );
}
