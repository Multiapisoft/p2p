'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { AddressQr } from '@/shared/components/AddressQr';

type TwoFactorStatus = { enabled: boolean };
type TwoFactorSetup = { secret: string; otpauthUrl: string };

function errorMessage(err: unknown, fallback: string) {
  if (!err || typeof err !== 'object') return fallback;
  const msg = (err as { response?: { data?: { message?: string | string[] } } }).response?.data
    ?.message;
  if (Array.isArray(msg)) return msg.filter(Boolean).join(', ') || fallback;
  if (typeof msg === 'string' && msg.trim()) return msg;
  return fallback;
}

export function TwoFactorPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['auth-2fa'],
    queryFn: () => apiGet<TwoFactorStatus>('/auth/2fa'),
  });

  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const startSetup = useMutation({
    mutationFn: () => apiPost<TwoFactorSetup>('/auth/2fa/setup'),
    onSuccess: (res) => {
      setSetup(res);
      setMessage('');
    },
    onError: (err) => setMessage(errorMessage(err, 'Could not start 2FA setup')),
  });

  const enable = useMutation({
    mutationFn: () => apiPost('/auth/2fa/enable', { code }),
    onSuccess: () => {
      setSetup(null);
      setCode('');
      setMessage('Two-factor authentication is on');
      qc.invalidateQueries({ queryKey: ['auth-2fa'] });
    },
    onError: (err) => setMessage(errorMessage(err, 'Invalid code')),
  });

  const disable = useMutation({
    mutationFn: () => apiPost('/auth/2fa/disable', { code, password }),
    onSuccess: () => {
      setCode('');
      setPassword('');
      setMessage('Two-factor authentication is off');
      qc.invalidateQueries({ queryKey: ['auth-2fa'] });
    },
    onError: (err) => setMessage(errorMessage(err, 'Could not disable 2FA')),
  });

  const enabled = !!data?.enabled;

  return (
    <Card title="Two-factor authentication">
      <p className="mb-3 text-sm text-on-surface-variant">
        Authenticator app (Google Authenticator, Authy). Works for every role.
      </p>
      {enabled ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            disable.mutate();
          }}
        >
          <p className="text-sm font-medium text-secondary">2FA is enabled on this account.</p>
          <Input
            label="Authenticator code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" variant="outline" loading={disable.isPending}>
            Disable 2FA
          </Button>
        </form>
      ) : setup ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enable.mutate();
          }}
        >
          <p className="text-sm">Scan this in your authenticator app, then enter the 6-digit code.</p>
          <AddressQr value={setup.otpauthUrl} label="Scan with authenticator app" size={180} />
          <p className="text-xs text-on-surface-variant">Can&apos;t scan? Enter this key manually:</p>
          <p className="break-all rounded-lg bg-surface-container-high px-3 py-2 font-mono text-xs">
            {setup.secret}
          </p>
          <Input
            label="Authenticator code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            required
          />
          <Button type="submit" loading={enable.isPending}>
            Verify and enable
          </Button>
        </form>
      ) : (
        <Button type="button" onClick={() => startSetup.mutate()} loading={startSetup.isPending}>
          Enable 2FA
        </Button>
      )}
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </Card>
  );
}
