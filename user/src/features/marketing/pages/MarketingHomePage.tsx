'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { brand } from '@/shared/brand';
import { useAuthStore } from '@/features/auth/store/auth.store';

const FEATURES = [
  {
    icon: 'payments' as const,
    title: 'Deposit and withdraw',
    detail: 'Track every request with clear status until money settles.',
  },
  {
    icon: 'qr_code_2' as const,
    title: 'Platform Payment',
    detail: 'Pay open requests and confirm receipt in one flow.',
  },
  {
    icon: 'support_agent' as const,
    title: 'Business support',
    detail: 'Raise tickets to your business when something needs help.',
  },
] as const;

export function MarketingHomePage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) router.replace('/home');
  }, [token, router]);

  if (token) return null;

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <header className="relative z-10 flex items-center justify-between border-b border-outline-variant/60 bg-surface-container-lowest/90 px-5 py-4 backdrop-blur sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-3xl text-primary">{brand.icon}</span>
          <span className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight text-on-surface sm:text-2xl">
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

      <main>
        <section className="relative overflow-hidden bg-[#1a2e1a] text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_480px_at_0%_0%,rgba(107,142,78,0.35),transparent_55%),radial-gradient(700px_420px_at_100%_20%,rgba(215,229,196,0.12),transparent_50%)]"
          />
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-10 sm:pb-20 sm:pt-16">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#d7e5c4]">
              {brand.domainHint}
            </p>
            <h1 className="max-w-3xl font-[family-name:var(--font-headline)] text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
              {brand.name}
            </h1>
            <p className="mt-4 max-w-2xl font-[family-name:var(--font-headline)] text-2xl font-semibold leading-snug text-[#d7e5c4] sm:text-3xl">
              {brand.tagline}
            </p>
            <p className="mt-5 max-w-xl text-base text-white/85 sm:text-lg">{brand.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-xl bg-[#d7e5c4] px-5 py-3 text-sm font-bold text-[#2f3d18] hover:opacity-95"
              >
                {brand.ctaPrimary}
              </Link>
              <Link
                href="/register"
                className="rounded-xl border-2 border-[#d7e5c4]/70 px-5 py-3 text-sm font-semibold text-[#d7e5c4] hover:bg-white/10"
              >
                {brand.ctaSecondary}
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12 sm:px-10 sm:py-16">
          <h2 className="font-[family-name:var(--font-headline)] text-2xl font-bold text-on-surface sm:text-3xl">
            What you can do
          </h2>
          <p className="mt-2 max-w-xl text-sm text-on-surface-variant sm:text-base">
            One wallet for deposits, payouts, and Platform Payment matching.
          </p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {FEATURES.map((item) => (
              <li key={item.title} className="flex gap-3 sm:flex-col sm:gap-3">
                <span className="material-symbols-outlined shrink-0 text-3xl text-primary">
                  {item.icon}
                </span>
                <div>
                  <p className="font-semibold text-on-surface">{item.title}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-outline-variant px-5 py-6 text-center text-xs text-on-surface-variant sm:px-10">
        © {new Date().getFullYear()} {brand.name} · {brand.productLine}
      </footer>
    </div>
  );
}
