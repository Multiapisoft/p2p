import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExchangeRateService {
  constructor(private config: ConfigService) {}

  /** INR received for 1 USDT */
  getUsdtInrRate(): number {
    const raw = this.config.get<number>('exchange.usdtInrRate');
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate <= 0) {
      return 90;
    }
    return rate;
  }

  getQuote() {
    const usdtInr = this.getUsdtInrRate();
    return {
      usdtInr,
      pair: 'USDT/INR' as const,
      /** How much USDT is needed to pay this many INR */
      usdtForInr: (inrAmount: number) => this.inrToUsdt(inrAmount),
      /** How much INR you get for this many USDT */
      inrForUsdt: (usdtAmount: number) => this.usdtToInr(usdtAmount),
      updatedAt: new Date().toISOString(),
      source: 'config' as const,
    };
  }

  /** Convert INR payout → USDT debit (ceil to 6 dp so partner always covers). */
  inrToUsdt(inrAmount: number): number {
    const rate = this.getUsdtInrRate();
    return Math.ceil((inrAmount / rate) * 1e6) / 1e6;
  }

  usdtToInr(usdtAmount: number): number {
    const rate = this.getUsdtInrRate();
    return Math.round(usdtAmount * rate * 100) / 100;
  }
}
