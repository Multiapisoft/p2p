'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { profileApi } from '../api/profile.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { formatDate } from '@/shared/lib/utils';
import { normalizePhone, phoneError } from '@/shared/lib/validation';
import { toast } from '@/shared/ui/toast/toast.store';
import { TwoFactorPanel } from '../components/TwoFactorPanel';

export function ProfilePage() {
  const authUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getMe(),
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPhone(profile.phone || '');
    }
  }, [profile]);

  const update = useMutation({
    mutationFn: () =>
      profileApi.updateMe({
        name,
        phone: normalizePhone(phone),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      setFormError('');
      toast.success('Profile updated');
    },
    onError: () => toast.error('Could not update profile'),
  });

  const joinBusiness = useMutation({
    mutationFn: () => profileApi.attachReferral(referralCode.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      setReferralCode('');
      toast.success('Joined business', 'Your withdrawals will use this business referral');
    },
    onError: (error: unknown) => {
      let msg = 'Could not join with this code';
      if (axios.isAxiosError(error)) {
        const m = error.response?.data?.message;
        if (typeof m === 'string' && m.trim()) msg = m;
      }
      toast.error('Join failed', msg);
    },
  });

  if (isLoading) return <LoadingScreen />;

  const linked = !!(profile?.referredByBusiness || profile?.referredBusiness);
  const businessName = profile?.referredBusiness?.name;
  const businessReferralCode = profile?.referredBusiness?.referralCode;
  const hasBusinessMeta = !!(businessName || businessReferralCode || profile?.businessUserCode);

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Profile</h1>
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
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant">Business</dt>
            <dd className="text-right font-medium">
                  {linked || hasBusinessMeta ? (
                <span>
                  {businessName || 'Linked via referral'}
                  {(businessReferralCode || profile?.businessUserCode) && (
                    <span className="mt-0.5 block font-mono text-xs text-on-surface-variant">
                      {[
                        businessReferralCode ? `Code: ${businessReferralCode}` : null,
                        profile?.businessUserCode
                          ? `Your ID: ${profile.businessUserCode}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
              ) : (
                'Not linked'
              )}
            </dd>
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
            const pMsg = phoneError(phone, true);
            if (pMsg) {
              setFormError(pMsg);
              return;
            }
            setFormError('');
            update.mutate();
          }}
        >
          <Input label="Full Name" icon="person" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Phone *"
            icon="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile"
            inputMode="numeric"
            maxLength={13}
            required
          />
          {formError && (
            <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
              {formError}
            </div>
          )}
          <Button type="submit" loading={update.isPending} className="w-full sm:w-auto">
            Save Changes
          </Button>
          {update.isSuccess && (
            <p className="text-sm text-on-secondary-container">Profile updated successfully.</p>
          )}
        </form>
      </Card>

      <TwoFactorPanel />

      {!linked && (
        <Card title="Join a business">
          <p className="mb-4 text-sm text-on-surface-variant">
            Enter a business code to link your account. Your withdrawals will then wait
            for that business (or admin) to approve them for the Platform Payment list.
          </p>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!referralCode.trim()) return;
              joinBusiness.mutate();
            }}
          >
            <div className="flex-1">
              <Input
                label="Business code"
                icon="redeem"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="e.g. ref_bitfarm_xxxxxxxx"
                required
              />
            </div>
            <Button type="submit" loading={joinBusiness.isPending} className="sm:mb-0.5">
              Join
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
