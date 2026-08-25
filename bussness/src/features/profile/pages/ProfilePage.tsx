'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { businessApi } from '@/features/business/api/business.api';
import { usersApi } from '@/features/users/api/users.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Textarea } from '@/shared/components/ui/Textarea';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { LoadingScreen, SecretBanner, CopyField } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { getApiErrorMessage, isNotFoundError } from '@/shared/api/client';
import { normalizePhone, phoneError } from '@/shared/lib/validation';
import { TwoFactorPanel } from '../components/TwoFactorPanel';
import { StaffPanel } from '../components/StaffPanel';
import type { PaymentMethod } from '@/shared/types/api.types';
import { userInviteRegisterUrl } from '@/shared/lib/user-app-url';

const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'bank', 'usdt'];

export function ProfilePage() {
  const qc = useQueryClient();
  const pendingApiKey = useAuthStore((s) => s.pendingApiKey);
  const pendingApiSecret = useAuthStore((s) => s.pendingApiSecret);
  const pendingInternalSecret = useAuthStore((s) => s.pendingInternalSecret);
  const setPendingApiCredentials = useAuthStore((s) => s.setPendingApiCredentials);
  const authIsOwner = !useAuthStore((s) => s.user)?.staffBusinessId;

  const { data: business, isLoading: loadingBusiness, error: businessError } = useQuery({
    queryKey: ['business-me'],
    queryFn: () => businessApi.getMe(),
    retry: (count, err) => !isNotFoundError(err) && count < 1,
  });

  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ['user-me'],
    queryFn: () => usersApi.getMe(),
  });

  const { data: integrationConfig } = useQuery({
    queryKey: ['business-integration-config'],
    queryFn: () => businessApi.getIntegrationConfig(),
    enabled: !!business,
  });

  const noBusiness = isNotFoundError(businessError);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (business) {
      setName(business.name);
      setDescription(business.description ?? '');
      setWebhookUrl(business.webhookUrl ?? '');
      setMethods(business.allowedPaymentMethods ?? []);
    }
  }, [business]);

  useEffect(() => {
    if (user) {
      setUserName(user.name);
      setUserPhone(user.phone ?? '');
    }
  }, [user]);

  const updateBusiness = useMutation({
    mutationFn: () =>
      businessApi.update({
        name,
        description: description || undefined,
        webhookUrl: webhookUrl || undefined,
        allowedPaymentMethods: methods,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-me'] }),
  });

  const updateUser = useMutation({
    mutationFn: () =>
      usersApi.updateMe({
        name: userName,
        phone: userPhone.trim() ? normalizePhone(userPhone) : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-me'] }),
  });

  const changePassword = useMutation({
    mutationFn: () => usersApi.setOwnPassword(newPassword, currentPassword),
    onSuccess: () => {
      setPasswordMsg({ type: 'ok', text: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err) =>
      setPasswordMsg({
        type: 'err',
        text: getApiErrorMessage(err, 'Could not update password'),
      }),
  });

  const createMissingBusiness = useMutation({
    mutationFn: () =>
      businessApi.create({
        name: name.trim() || user?.name || 'My Business',
        allowedPaymentMethods: PAYMENT_METHODS,
      }),
    onSuccess: (data) => {
      setPendingApiCredentials(data.apiKey, data.apiSecret, data.internalSecret);
      qc.invalidateQueries({ queryKey: ['business-me'] });
    },
  });

  if (loadingBusiness || loadingUser) return <LoadingScreen />;

  if (noBusiness) {
    return (
      <div className="mx-auto max-w-xl space-y-6 py-8">
        <PageHeader
          title="Finish business setup"
          description="Create your business to get a referral / business code — no partner URL needed"
        />
        <Card>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              createMissingBusiness.mutate();
            }}
          >
            <Input
              label="Business name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={user?.name || 'Your business name'}
              required
            />
            {createMissingBusiness.isError ? (
              <p className="text-sm text-error">
                {getApiErrorMessage(createMissingBusiness.error, 'Could not create business')}
              </p>
            ) : null}
            <Button type="submit" className="w-full" loading={createMissingBusiness.isPending}>
              Create business & generate code
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile" description="Business settings & account" />

      {(pendingApiSecret || pendingInternalSecret) && (
        <SecretBanner
          apiKey={pendingApiKey || business?.apiKey}
          secret={pendingApiSecret || ''}
          internalSecret={pendingInternalSecret || undefined}
          onDismiss={() => setPendingApiCredentials(null, null, null)}
        />
      )}

      <Card title="API Integration">
        <p className="mb-4 text-sm text-on-surface-variant">
          Manage API keys, internal keys, partner URLs and user tools in the Integration section.
        </p>
        <Link href="/integration">
          <Button variant="secondary">Open Integration →</Button>
        </Link>
      </Card>

      <Card title="Business Status">
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">Status:</span>
          <StatusBadge status={business?.status ?? 'pending'} />
        </div>
      </Card>

      <Card title="Business code">
        <p className="mb-3 text-sm text-on-surface-variant">
          Share the code or invite link — users will register with it.
        </p>
        {business?.referralCode ? (
          <div className="space-y-3">
            <CopyField label="Business code" value={business.referralCode} />
            <CopyField
              label="Invite link (user panel)"
              value={userInviteRegisterUrl(business.referralCode, integrationConfig?.userPanelUrl)}
            />
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">Business code is not available yet.</p>
        )}
      </Card>

      <Card title="Business Details">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            updateBusiness.mutate();
          }}
        >
          <Input label="Business Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input
            label="Webhook URL"
            icon="webhook"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-site.com/webhook"
          />
          <div>
            <p className="mb-2 text-sm font-semibold">Payment Methods</p>
            <div className="chip-scroll">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
                  }
                  className={`chip capitalize ${methods.includes(m) ? 'chip-active' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" loading={updateBusiness.isPending}>
            Save Business Details
          </Button>
        </form>
      </Card>

      <Card title="Account">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const pMsg = phoneError(userPhone, false);
            if (pMsg) {
              alert(pMsg);
              return;
            }
            updateUser.mutate();
          }}
        >
          <Input label="Email" value={user?.email ?? ''} disabled />
          <Input label="Name" value={userName} onChange={(e) => setUserName(e.target.value)} required />
          <Input
            label="Phone"
            value={userPhone}
            onChange={(e) => setUserPhone(e.target.value)}
            placeholder="10-digit mobile"
            inputMode="numeric"
            maxLength={13}
          />
          <Button type="submit" loading={updateUser.isPending}>
            Update Account
          </Button>
        </form>
      </Card>

      <Card title="Change login password">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPasswordMsg(null);
            if (newPassword.length < 8) {
              setPasswordMsg({ type: 'err', text: 'New password must be at least 8 characters' });
              return;
            }
            if (newPassword !== confirmPassword) {
              setPasswordMsg({ type: 'err', text: 'New passwords do not match' });
              return;
            }
            changePassword.mutate();
          }}
        >
          <Input
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            minLength={8}
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
          {passwordMsg ? (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                passwordMsg.type === 'ok'
                  ? 'border border-secondary/30 bg-secondary/5 text-secondary'
                  : 'border border-error/30 bg-error/5 text-error'
              }`}
            >
              {passwordMsg.text}
            </p>
          ) : null}
          <Button type="submit" loading={changePassword.isPending}>
            Update password
          </Button>
        </form>
      </Card>

      <TwoFactorPanel />
      {authIsOwner && <StaffPanel />}
    </div>
  );
}
