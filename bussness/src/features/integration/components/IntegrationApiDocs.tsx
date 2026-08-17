'use client';

import { Card } from '@/shared/components/ui/Card';
import { CopyField } from '@/shared/components/ui/Icon';

interface IntegrationApiDocsProps {
  apiBase: string;
}

const ENDPOINTS = [
  { label: 'Verify connection', method: 'GET', path: '/integration/verify', secure: false },
  { label: 'Register user', method: 'POST', path: '/integration/users', secure: false },
  { label: 'List users', method: 'GET', path: '/integration/users', secure: false },
  { label: 'User lookup (login → balance)', method: 'GET', path: '/integration/users/lookup?email=', secure: true },
  { label: 'User balance', method: 'GET', path: '/integration/users/:userId/balance', secure: true },
  { label: 'Credit user', method: 'POST', path: '/integration/users/:userId/credit', secure: true },
  { label: 'Debit user', method: 'POST', path: '/integration/users/:userId/debit', secure: true },
  { label: 'Redirect deposit', method: 'POST', path: '/integration/redirect/deposit', secure: true },
  { label: 'Redirect withdrawal', method: 'POST', path: '/integration/redirect/withdrawal', secure: true },
  { label: 'Cancel deposit', method: 'PATCH', path: '/integration/deposits/:referenceId/cancel', secure: true },
  { label: 'Cancel withdrawal', method: 'PATCH', path: '/integration/withdrawals/:referenceId/cancel', secure: true },
  { label: 'Create deposit (API)', method: 'POST', path: '/deposits/integration', secure: true },
  { label: 'Get deposit', method: 'GET', path: '/integration/deposits/:referenceId', secure: false },
  { label: 'Test webhook', method: 'POST', path: '/integration/webhook/test', secure: false },
];

export function IntegrationApiDocs({ apiBase }: IntegrationApiDocsProps) {
  return (
    <div className="space-y-6">
      <Card title="Required Headers">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-container-low p-4 text-sm">
            <p className="font-semibold">Basic (register, verify)</p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-on-surface-variant">
              <li>X-Api-Key</li>
              <li>X-Api-Secret</li>
            </ul>
          </div>
          <div className="rounded-lg border border-secondary/30 bg-secondary-container/20 p-4 text-sm">
            <p className="font-semibold text-on-secondary-container">Wallet ops (secure)</p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-on-surface-variant">
              <li>X-Api-Key</li>
              <li>X-Api-Secret</li>
              <li>X-Internal-Secret</li>
            </ul>
            <p className="mt-2 text-xs">Server-side only — never in browser URLs</p>
          </div>
        </div>
      </Card>

      <Card title="API Endpoints">
        <div className="space-y-4">
          {ENDPOINTS.map(({ label, method, path, secure }) => (
            <div key={`${method}:${path}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{label}</p>
                {secure && (
                  <span className="rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase text-on-secondary-container">
                    + Internal secret
                  </span>
                )}
              </div>
              <code className="block overflow-x-auto rounded-lg bg-surface-container-low p-3 font-mono text-xs">
                {method} {apiBase}
                {path}
              </code>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Request Examples">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold">Lookup on login (third-party server)</p>
            <pre className="overflow-x-auto rounded-lg bg-surface-container-low p-4 text-xs">{`GET /integration/users/lookup?email=user@example.com
Headers:
  X-Api-Key, X-Api-Secret, X-Internal-Secret

Response:
{
  "user": { "id", "email", "name", ... },
  "balance": { "availableBalance", "balance", "lockedBalance" }
}`}</pre>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Credit / Debit body</p>
            <pre className="overflow-x-auto rounded-lg bg-surface-container-low p-4 text-xs">{`{
  "amount": 500,
  "externalRef": "optional-ref",
  "reason": "optional note"
}`}</pre>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Redirect deposit / withdrawal</p>
            <pre className="overflow-x-auto rounded-lg bg-surface-container-low p-4 text-xs">{`{
  "userId": "<integrated-user-id>",
  "amount": 500,
  "returnUrl": "https://your-site.com/callback",
  "externalRef": "optional-ref"
}`}</pre>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Register user</p>
            <pre className="overflow-x-auto rounded-lg bg-surface-container-low p-4 text-xs">{`{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe",
  "phone": "+919999999999"
}`}</pre>
          </div>
        </div>
      </Card>

      <Card title="Integration Flow">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-on-surface-variant">
          <li>User logs in on your third-party website (your own login system)</li>
          <li>
            Your server calls{' '}
            <code className="text-xs">GET /integration/users/lookup?email=...</code> with 3 headers
          </li>
          <li>Business auto-identified from API keys → user + balance in response</li>
          <li>Show balance on your panel — no FairPlay page URLs needed</li>
          <li>Deposit/Withdraw → redirect API → user completes on FairPlay panel</li>
          <li>Optional returnUrl in redirect body or default in API Setup tab</li>
        </ol>
      </Card>
    </div>
  );
}
