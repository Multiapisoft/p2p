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
import { LoadingScreen, SecretBanner } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { isNotFoundError } from '@/shared/api/client';
import type { PaymentMethod } from '@/shared/types/api.types';

const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'bank', 'usdt'];

export function ProfilePage() {
  const qc = useQueryClient();
  const pendingApiSecret = useAuthStore((s) => s.pendingApiSecret);
  const pendingInternalSecret = useAuthStore((s) => s.pendingInternalSecret);
  const setPendingApiCredentials = useAuthStore((s) => s.setPendingApiCredentials);

  const { data: business, isLoading: loadingBusiness, error: businessError } = useQuery({
    queryKey: ['business-me'],
    queryFn: () => businessApi.getMe(),
    retry: (count, err) => !isNotFoundError(err) && count < 1,
  });

  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ['user-me'],
    queryFn: () => usersApi.getMe(),
  });

  const noBusiness = isNotFoundError(businessError);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);

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
    mutationFn: () => usersApi.updateMe({ name: userName, phone: userPhone || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-me'] }),
  });

  if (loadingBusiness || loadingUser) return <LoadingScreen />;

  if (noBusiness) {
    return (
      <div className="mx-auto max-w-xl space-y-6 text-center py-8">
        <PageHeader title="Profile" description="Business setup required" />
        <Card>
          <p className="mb-4 text-sm text-on-surface-variant">
            Submit your partner URLs on the Integration page to generate API keys and finish setup.
          </p>
          <Link href="/integration">
            <Button className="w-full">Go to Integration Setup</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile" description="Business settings & account" />

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
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
                  }
                  className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${
                    methods.includes(m) ? 'bg-primary text-on-primary' : 'border border-outline-variant'
                  }`}
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
            updateUser.mutate();
          }}
        >
          <Input label="Email" value={user?.email ?? ''} disabled />
          <Input label="Name" value={userName} onChange={(e) => setUserName(e.target.value)} required />
          <Input label="Phone" value={userPhone} onChange={(e) => setUserPhone(e.target.value)} />
          <Button type="submit" loading={updateUser.isPending}>
            Update Account
          </Button>
        </form>
      </Card>
    </div>
  );
}
