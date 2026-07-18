'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { businessApi } from '@/features/business/api/business.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { CopyField, LoadingScreen, SecretBanner } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { IntegrationUserTools } from '@/features/integration/components/IntegrationUserTools';
import { isNotFoundError, getApiErrorMessage } from '@/shared/api/client';
import type { PaymentMethod } from '@/shared/types/api.types';

const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'bank', 'usdt'];
const DEMO_BASE = 'http://localhost:5177';

export function IntegrationPage() {
  const searchParams = useSearchParams();
  const preselectedUserId = searchParams.get('userId') ?? undefined;
  const tab = searchParams.get('tab');
  const qc = useQueryClient();
  const setPendingApiCredentials = useAuthStore((s) => s.setPendingApiCredentials);
  const pendingApiSecret = useAuthStore((s) => s.pendingApiSecret);
  const pendingInternalSecret = useAuthStore((s) => s.pendingInternalSecret);
  const pendingApiKey = useAuthStore((s) => s.pendingApiKey);

  const [setupName, setSetupName] = useState('');
  const [balanceUrl, setBalanceUrl] = useState(`${DEMO_BASE}/api/p2p/partner/balance`);
  const [creditUrl, setCreditUrl] = useState(`${DEMO_BASE}/api/p2p/partner/credit`);
  const [debitUrl, setDebitUrl] = useState(`${DEMO_BASE}/api/p2p/partner/debit`);
  const [error, setError] = useState('');

  const { data: business, isLoading, error: businessError } = useQuery({
    queryKey: ['business-me'],
    queryFn: () => businessApi.getMe(),
    retry: (count, err) => !isNotFoundError(err) && count < 1,
  });

  const { data: partnerApi } = useQuery({
    queryKey: ['partner-api'],
    queryFn: () => businessApi.getPartnerApi(),
    enabled: !!business,
  });

  const noBusiness = isNotFoundError(businessError);

  useEffect(() => {
    if (partnerApi?.balanceUrl) setBalanceUrl(partnerApi.balanceUrl);
    if (partnerApi?.creditUrl) setCreditUrl(partnerApi.creditUrl);
    if (partnerApi?.debitUrl) setDebitUrl(partnerApi.debitUrl);
  }, [partnerApi]);

  useEffect(() => {
    if (tab !== 'tools' && !preselectedUserId) return;
    const t = setTimeout(() => {
      document.getElementById('user-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => clearTimeout(t);
  }, [tab, preselectedUserId, business]);

  const createBusiness = useMutation({
    mutationFn: () =>
      businessApi.create({
        name: setupName,
        partnerApi: {
          balanceUrl: balanceUrl.trim(),
          creditUrl: creditUrl.trim(),
          debitUrl: debitUrl.trim(),
        },
        allowedPaymentMethods: PAYMENT_METHODS,
      }),
    onSuccess: (data) => {
      setPendingApiCredentials(data.apiKey, data.apiSecret, data.internalSecret);
      setError('');
      qc.invalidateQueries({ queryKey: ['business-me'] });
      qc.invalidateQueries({ queryKey: ['partner-api'] });
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Setup failed')),
  });

  const saveUrls = useMutation({
    mutationFn: () =>
      businessApi.updatePartnerApi({
        balanceUrl: balanceUrl.trim(),
        creditUrl: creditUrl.trim(),
        debitUrl: debitUrl.trim(),
      }),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['partner-api'] });
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Failed to save')),
  });

  const regenerateKeys = useMutation({
    mutationFn: () => businessApi.regenerateKeys(),
    onSuccess: (data) => {
      setPendingApiCredentials(data.apiKey, data.apiSecret, data.internalSecret);
      qc.invalidateQueries({ queryKey: ['business-me'] });
      qc.invalidateQueries({ queryKey: ['partner-api'] });
    },
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Integration"
        description="Configure partner balance, credit, and debit URLs, then manage API keys"
        action={business ? <StatusBadge status={business.status} /> : undefined}
      />

      {(pendingApiSecret || pendingInternalSecret) && (
        <SecretBanner
          apiKey={pendingApiKey || business?.apiKey}
          secret={pendingApiSecret || ''}
          internalSecret={pendingInternalSecret || undefined}
          onDismiss={() => setPendingApiCredentials(null, null, null)}
        />
      )}

      {noBusiness ? (
        <Card title="Setup">
          <p className="mb-4 text-sm text-on-surface-variant">
            Enter the exact balance, credit, and debit URLs provided by your partner. After keys are
            created, paste them into the partner application environment variables.
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              createBusiness.mutate();
            }}
          >
            <Input
              label="Business Name"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              required
            />
            <Input
              label="Balance URL"
              type="url"
              value={balanceUrl}
              onChange={(e) => setBalanceUrl(e.target.value)}
              required
            />
            <Input
              label="Credit URL"
              type="url"
              value={creditUrl}
              onChange={(e) => setCreditUrl(e.target.value)}
              required
            />
            <Input
              label="Debit URL"
              type="url"
              value={debitUrl}
              onChange={(e) => setDebitUrl(e.target.value)}
              required
            />
            {error && (
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" loading={createBusiness.isPending}>
              Create & Generate Keys
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <Card
            title="API Keys"
            action={
              <Button
                size="sm"
                variant="outline"
                loading={regenerateKeys.isPending}
                onClick={() => regenerateKeys.mutate()}
              >
                Regenerate Keys
              </Button>
            }
          >
            <CopyField label="API Key" value={business?.apiKey ?? ''} />
            <p className="mt-2 text-xs text-on-surface-variant">
              API Secret and Internal Secret are shown only when you create or regenerate keys. Paste
              them into the partner <code>P2P_API_*</code> environment variables.
            </p>
            {partnerApi?.configured && (
              <div className="mt-4 space-y-2 rounded-lg bg-surface-container-low p-3 text-xs">
                <p className="font-semibold text-on-surface">Linked URLs</p>
                <p className="break-all text-on-surface-variant">Balance: {partnerApi.balanceUrl}</p>
                <p className="break-all text-on-surface-variant">Credit: {partnerApi.creditUrl}</p>
                <p className="break-all text-on-surface-variant">Debit: {partnerApi.debitUrl}</p>
              </div>
            )}
          </Card>

          <Card title="Partner URLs" className="scroll-mt-20">
            <p className="mb-4 text-sm text-on-surface-variant">
              Each partner can use different endpoints. Set the exact URLs here so balance and wallet
              actions call the correct partner APIs.
            </p>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError('');
                saveUrls.mutate();
              }}
            >
              <Input
                label="Balance URL"
                type="url"
                value={balanceUrl}
                onChange={(e) => setBalanceUrl(e.target.value)}
                required
              />
              <Input
                label="Credit URL"
                type="url"
                value={creditUrl}
                onChange={(e) => setCreditUrl(e.target.value)}
                required
              />
              <Input
                label="Debit URL"
                type="url"
                value={debitUrl}
                onChange={(e) => setDebitUrl(e.target.value)}
                required
              />
              {error && (
                <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                  {error}
                </div>
              )}
              <Button type="submit" loading={saveUrls.isPending}>
                Save URLs
              </Button>
            </form>
          </Card>

          <div id="user-tools" className="scroll-mt-24">
            <IntegrationUserTools initialUserId={preselectedUserId} />
          </div>
        </>
      )}
    </div>
  );
}
