'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatDate, apiErrorMessage } from '@/shared/lib/utils';

type TeamMember = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  createdAt?: string;
};

type ReferralTeamResponse = {
  referralCode: string;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: TeamMember[];
};

const PAGE_SIZES = [10, 20, 50];

export function MyTeamsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, search, sort: 'newest' }),
    [page, limit, search],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['investor-referral-team', listQuery],
    queryFn: () =>
      apiGet<ReferralTeamResponse>('/users/me/referral-team', {
        page: listQuery.page,
        limit: listQuery.limit,
        search: listQuery.search || undefined,
        sort: listQuery.sort,
      }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const referralCode = data?.referralCode || '';

  const shareUrl =
    typeof window !== 'undefined' && referralCode
      ? `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}`
      : '';

  const copyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
          My Teams
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Your referral code and everyone who joined with it
        </p>
      </div>

      <Card>
        <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
          Your referral code
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-surface-container-low px-3 py-2 text-sm font-semibold">
            {isLoading ? '…' : referralCode || '—'}
          </code>
          <Button type="button" size="sm" variant="outline" onClick={() => void copyCode()}>
            {copied ? 'Copied' : 'Copy code'}
          </Button>
          {shareUrl ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void copyLink()}>
              Copy invite link
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          Team size: <span className="font-semibold text-on-surface">{total}</span>
        </p>
      </Card>

      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <Input
              label="Search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name, email, phone…"
            />
          </div>
          <label className="block text-sm sm:w-36">
            <span className="mb-1 block font-medium text-on-surface-variant">Per page</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-xl border border-error/30 bg-error-container/40 px-4 py-6 text-center">
            <p className="text-sm">{apiErrorMessage(error, 'Could not load team')}</p>
            <Button type="button" className="mt-3" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search
                ? 'No members match your search'
                : 'No one has joined with your code yet'
            }
            icon="groups"
          />
        ) : (
          <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
            {items.map((m) => (
              <div
                key={m._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant p-3 sm:p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.name}</p>
                  <p className="mt-0.5 break-all text-xs text-on-surface-variant">
                    {m.email}
                    {m.phone ? ` · ${m.phone}` : ''}
                    {m.createdAt ? ` · Joined ${formatDate(m.createdAt)}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase">
                  {m.role}
                </span>
              </div>
            ))}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
