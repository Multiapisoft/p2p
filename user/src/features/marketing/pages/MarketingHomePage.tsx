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
    <div className="min-h-dvh bg-background text-on-surface">
      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-3xl text-primary">{brand.icon}</span>
          <span className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
            {brand.name}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary hover:opacity-90"
          >
            {brand.ctaSecondary}
          </Link>
        </div>
      </header>

      <main className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_10%_-10%,rgba(85,107,47,0.35),transparent_55%),radial-gradient(900px_500px_at_90%_10%,rgba(212,168,67,0.18),transparent_50%),linear-gradient(165deg,#1a2e1a_0%,#2f3d18_45%,#f7f8f4_45%)]"
        />
        <section className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-8 sm:px-10 sm:pb-24 sm:pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="text-white lg:pb-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-secondary-container/90">
              {brand.domainHint}
            </p>
            <h1 className="font-[family-name:var(--font-headline)] text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              {brand.tagline}
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/85 sm:text-lg">{brand.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-xl bg-secondary-container px-5 py-3 text-sm font-bold text-on-secondary-container hover:opacity-95"
              >
                {brand.ctaPrimary}
              </Link>
              <Link
                href="/register"
                className="rounded-xl border border-white/35 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10"
              >
                {brand.ctaSecondary}
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-6 text-white backdrop-blur-md sm:p-8">
            <p className="font-[family-name:var(--font-headline)] text-lg font-semibold">What you can do</p>
            <ul className="mt-4 space-y-3 text-sm text-white/90">
              <li className="flex gap-2">
                <span className="material-symbols-outlined text-secondary-container">payments</span>
                Deposit and withdraw with clear status
              </li>
              <li className="flex gap-2">
                <span className="material-symbols-outlined text-secondary-container">qr_code_2</span>
                Pay open requests via Platform Payment
              </li>
              <li className="flex gap-2">
                <span className="material-symbols-outlined text-secondary-container">support_agent</span>
                Raise support tickets to your business
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant px-5 py-6 text-center text-xs text-on-surface-variant sm:px-10">
        © {new Date().getFullYear()} {brand.name} · {brand.productLine}
      </footer>
    </div>
  );
}
