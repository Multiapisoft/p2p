'use client';



import Link from 'next/link';

import { useAuthStore } from '@/features/auth/store/auth.store';

import { Card } from '@/shared/components/ui/Card';

import { Button } from '@/shared/components/ui/Button';

import { CopyField, SecretBanner } from '@/shared/components/ui/Icon';



interface ApiCredentialsCardProps {

  apiKey: string;

  referralCode?: string;

  showIntegrationLink?: boolean;

  onRegenerate?: () => void;

  onRegenerateInternal?: () => void;

  onGenerate?: () => void;

  hasBusiness?: boolean;

}



export function ApiCredentialsCard({

  apiKey,

  referralCode,

  showIntegrationLink = true,

  onRegenerate,

  onRegenerateInternal,

  onGenerate,

  hasBusiness = true,

}: ApiCredentialsCardProps) {

  const pendingApiKey = useAuthStore((s) => s.pendingApiKey);

  const pendingApiSecret = useAuthStore((s) => s.pendingApiSecret);

  const pendingInternalSecret = useAuthStore((s) => s.pendingInternalSecret);

  const setPendingApiCredentials = useAuthStore((s) => s.setPendingApiCredentials);



  const displayApiKey = pendingApiKey || apiKey;



  const baseUrl =

    typeof window !== 'undefined'

      ? `${window.location.origin}/api/v1`

      : 'https://your-domain.com/api/v1';



  if (!hasBusiness) {

    return (

      <Card title="API Credentials">

        <p className="mb-4 text-sm text-on-surface-variant">

          Create your business profile first to generate API keys for third-party integration.

        </p>

        {onGenerate ? (

          <Button onClick={onGenerate}>Generate API Keys</Button>

        ) : (

          <Link

            href="/profile?setup=1"

            className="inline-flex rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-on-primary"

          >

            Set Up Business Profile

          </Link>

        )}

      </Card>

    );

  }



  return (

    <div className="space-y-4">

      {(pendingApiSecret || pendingInternalSecret) && (

        <SecretBanner

          apiKey={displayApiKey}

          secret={pendingApiSecret || ''}

          internalSecret={pendingInternalSecret || undefined}

          onDismiss={() => setPendingApiCredentials(null, null, null)}

        />

      )}



      <Card

        title="API Credentials — Third-Party Integration"

        action={

          onRegenerate || onRegenerateInternal ? (

            <div className="flex flex-wrap gap-2">

              {onRegenerateInternal && (

                <Button size="sm" variant="outline" onClick={onRegenerateInternal}>

                  Regen Internal Secret

                </Button>

              )}

              {onRegenerate && (

                <Button size="sm" variant="outline" onClick={onRegenerate}>

                  Regenerate All

                </Button>

              )}

            </div>

          ) : null

        }

      >

        <p className="mb-4 text-sm text-on-surface-variant">

          3 headers for wallet ops: <strong>API Key</strong>, <strong>API Secret</strong>, and{' '}

          <strong>Internal Secret</strong> (server-side only).

        </p>



        <div className="space-y-4">

          <CopyField label="API Key" value={displayApiKey} />

          {pendingApiSecret ? (

            <CopyField label="API Secret (Private) — save now!" value={pendingApiSecret} />

          ) : (

            <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">

              <p className="font-semibold text-on-surface">API Secret is hidden</p>

              <p className="mt-1">

                For security, secrets are only shown once when created or regenerated.

              </p>

            </div>

          )}

          {pendingInternalSecret ? (

            <CopyField label="Internal Secret (Private) — save now!" value={pendingInternalSecret} />

          ) : (

            <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">

              <p className="font-semibold text-on-surface">Internal Secret is hidden</p>

              <p className="mt-1">

                Required for balance, credit, debit &amp; redirect. Regenerate if lost.

              </p>

            </div>

          )}

          {referralCode && <CopyField label="Referral Code (for users)" value={referralCode} />}

        </div>

      </Card>



      <Card title="Sample API Request (Lookup on login)">

        <pre className="overflow-x-auto rounded-lg bg-surface-container-low p-4 text-xs leading-relaxed">

{`curl -X GET "${baseUrl}/integration/users/lookup?email=user@example.com" \\

  -H "X-Api-Key: ${displayApiKey}" \\

  -H "X-Api-Secret: YOUR_API_SECRET" \\

  -H "X-Internal-Secret: YOUR_INTERNAL_SECRET"`}

        </pre>

        <p className="mt-3 text-xs text-on-surface-variant">

          Wallet ops need 3 headers. Basic verify:{' '}

          <code className="rounded bg-surface-container-high px-1">GET /integration/verify</code>{' '}

          (API Key + Secret only)

        </p>

        {showIntegrationLink && (

          <Link

            href="/integration"

            className="mt-3 inline-flex text-sm font-semibold text-secondary hover:underline"

          >

            Full API documentation →

          </Link>

        )}

      </Card>

    </div>

  );

}

