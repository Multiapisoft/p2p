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
    <div className="min-h-dvh bg-[#0c0c0c] text-[#f5f0e8]">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-3xl text-[#c9a227]">{brand.icon}</span>
          <span className="font-[family-name:var(--font-headline)] text-xl font-semibold tracking-tight sm:text-2xl">
            {brand.name}
          </span>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Link href="/login" className="px-3 py-2 text-sm font-medium text-white/70 hover:text-white">
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-full border border-[#c9a227] px-4 py-2 text-sm font-semibold text-[#c9a227] hover:bg-[#c9a227]/10"
          >
            {brand.ctaSecondary}
          </Link>
        </div>
      </header>

      <main className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_-20%,rgba(201,162,39,0.22),transparent_60%),linear-gradient(180deg,#0c0c0c_0%,#161616_100%)]"
        />
        <section className="relative mx-auto flex max-w-4xl flex-col items-center px-5 pb-24 pt-16 text-center sm:px-10 sm:pt-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#c9a227]">
            {brand.domainHint}
          </p>
          <h1 className="mt-6 font-[family-name:var(--font-headline)] text-4xl font-semibold leading-[1.1] sm:text-5xl md:text-6xl">
            {brand.tagline}
          </h1>
          <p className="mt-6 max-w-2xl text-base text-white/70 sm:text-lg">{brand.description}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-[#c9a227] px-7 py-3 text-sm font-bold text-[#121212] hover:bg-[#d4b03a]"
            >
              {brand.ctaPrimary}
            </Link>
            <Link
              href="/register"
              className="rounded-full border border-white/25 px-7 py-3 text-sm font-semibold text-white hover:bg-white/5"
            >
              {brand.ctaSecondary}
            </Link>
          </div>
          <p className="mt-14 max-w-lg text-sm text-white/50">
            Choose a plan · Fulfill Platform Payments · Redeem after target — timers keep claims fair.
          </p>
        </section>
      </main>
    </div>
  );
}
