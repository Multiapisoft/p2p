import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { BusinessDocument } from '../business/schemas/business.schema';

export interface PartnerBalanceResult {
  source: 'partner';
  email: string;
  currency: string;
  balance: number;
  lockedBalance: number;
  availableBalance: number;
  raw?: unknown;
}

@Injectable()
export class PartnerApiService {
  isConfigured(business: BusinessDocument): boolean {
    const cfg = business.partnerApi;
    return !!(
      cfg?.balanceUrl &&
      cfg?.creditUrl &&
      cfg?.debitUrl &&
      cfg?.apiKey &&
      cfg?.apiSecret
    );
  }

  async fetchBalanceByEmail(
    business: BusinessDocument,
    email: string,
    userId?: string,
  ): Promise<PartnerBalanceResult> {
    return this.fetchBalance(business, { email, userId });
  }

  async fetchBalance(
    business: BusinessDocument,
    opts: { email: string; userId?: string },
  ): Promise<PartnerBalanceResult> {
    const cfg = this.requireConfig(business);
    let url = this.appendQuery(cfg.balanceUrl!, 'email', opts.email.trim());
    if (opts.userId) {
      url = this.appendQuery(url, 'userId', opts.userId);
    }
    const data = await this.request(cfg, 'GET', url);
    const parsed = this.parseBalancePayload(data, opts.email);
    return { ...parsed, raw: data };
  }

  async creditPartner(
    business: BusinessDocument,
    email: string,
    amount: number,
    reason?: string,
    userId?: string,
  ) {
    const cfg = this.requireConfig(business);
    let url = this.appendQuery(cfg.creditUrl!, 'email', email.trim());
    if (userId) url = this.appendQuery(url, 'userId', userId);
    return this.request(cfg, 'POST', url, { amount, reason, userId });
  }

  async debitPartner(
    business: BusinessDocument,
    email: string,
    amount: number,
    reason?: string,
    userId?: string,
  ) {
    const cfg = this.requireConfig(business);
    let url = this.appendQuery(cfg.debitUrl!, 'email', email.trim());
    if (userId) url = this.appendQuery(url, 'userId', userId);
    return this.request(cfg, 'POST', url, { amount, reason, userId });
  }

  private requireConfig(business: BusinessDocument) {
    const cfg = business.partnerApi;
    if (!this.isConfigured(business)) {
      throw new BadRequestException('Third-party API URLs not configured');
    }
    return cfg!;
  }

  private appendQuery(url: string, key: string, value: string) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${key}=${encodeURIComponent(value)}`;
  }

  private async request(
    cfg: NonNullable<BusinessDocument['partnerApi']>,
    method: string,
    url: string,
    body?: unknown,
  ) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': cfg.apiKey!,
          'X-Api-Secret': cfg.apiSecret!,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      throw new ServiceUnavailableException(`Third-party API unreachable: ${msg}`);
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (json as { message?: string }).message ||
        `Third-party API returned ${res.status}`;
      throw new ServiceUnavailableException(message);
    }

    return (json as { data?: unknown }).data ?? json;
  }

  private parseBalancePayload(data: unknown, email: string): PartnerBalanceResult {
    const root = data as Record<string, unknown>;
    const nested =
      (root.balance as Record<string, unknown> | undefined) ||
      (root.wallet as Record<string, unknown> | undefined) ||
      root;

    const available =
      this.num(nested.availableBalance) ??
      this.num(nested.available) ??
      this.num(nested.balance) ??
      this.num(root.availableBalance) ??
      0;

    const total = this.num(nested.balance) ?? this.num(root.balance) ?? available;
    const locked =
      this.num(nested.lockedBalance) ??
      this.num(nested.locked) ??
      this.num(root.lockedBalance) ??
      Math.max(0, total - available);

    return {
      source: 'partner',
      email,
      currency: String(nested.currency || root.currency || 'INR'),
      balance: total,
      lockedBalance: locked,
      availableBalance: available,
    };
  }

  private num(v: unknown): number | undefined {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
      return Number(v);
    }
    return undefined;
  }
}
