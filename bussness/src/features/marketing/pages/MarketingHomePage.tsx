'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { brand } from '@/shared/brand';
import { useAuthStore } from '@/features/auth/store/auth.store';

export function MarketingHomePage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) router.replace('/home');
  }, [token, router]);

  if (token) return null;

  return (
    <div className="min-h-dvh bg-[#070f1c] text-[#f4f1ea]">
      <header className="flex items-center justify-between px-5 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-3xl text-amber-400">{brand.icon}</span>
          <span className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-wide sm:text-2xl">
            {brand.name}
          </span>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Link href="/login" className="px-3 py-2 text-sm font-semibold text-white/70 hover:text-white">
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-amber-500 px-3.5 py-2 text-sm font-bold text-[#0b1f3a] hover:bg-amber-400"
          >
            {brand.ctaSecondary}
          </Link>
        </div>
      </header>

      <main className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,#070f1c_0%,#0b1f3a_40%,#122a4a_70%),repeating-linear-gradient(-12deg,transparent,transparent_40px,rgba(245,158,11,0.04)_40px,rgba(245,158,11,0.04)_41px)]"
        />
        <section className="relative mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-10 sm:pt-16">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-400/90">{brand.domainHint}</p>
          <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-headline)] text-4xl font-bold leading-[1.08] sm:text-5xl md:text-6xl">
            {brand.tagline}
          </h1>
          <p className="mt-5 max-w-2xl text-base text-white/75 sm:text-lg">{brand.description}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-md bg-amber-500 px-6 py-3 text-sm font-bold text-[#0b1f3a] hover:bg-amber-400"
            >
              {brand.ctaPrimary}
            </Link>
            <Link
              href="/register"
              className="rounded-md border border-white/25 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5"
            >
              {brand.ctaSecondary}
            </Link>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            {[
              ['group', 'User codes', 'Tag every user so approvals stay clear'],
              ['fact_check', 'Approve & list', 'Control Platform Payment listing'],
              ['monitoring', 'Live ops', 'Deposits, withdrawals, tickets in one desk'],
            ].map(([icon, title, body]) => (
              <div key={title} className="border-l-2 border-amber-500/70 pl-4">
                <span className="material-symbols-outlined text-amber-400">{icon}</span>
                <p className="mt-2 font-[family-name:var(--font-headline)] text-lg font-semibold">{title}</p>
                <p className="mt-1 text-sm text-white/65">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
