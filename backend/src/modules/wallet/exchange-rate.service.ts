import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type UsdtRateSide = 'buy' | 'sell';

export type BusinessUsdtRates = {
  /** INR per 1 USDT when buying USDT with INR (INR → USDT). */
  usdtBuyInrRate?: number | null;
  /** INR per 1 USDT when converting USDT → INR value. */
  usdtSellInrRate?: number | null;
};

@Injectable()
export class ExchangeRateService {
  constructor(private config: ConfigService) {}

  /** Platform default INR received for 1 USDT */
  getUsdtInrRate(): number {
    const raw = this.config.get<number>('exchange.usdtInrRate');
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate <= 0) {
      return 90;
    }
    return rate;
  }

  /**
   * Resolve effective rate for a business.
   * buy = INR→USDT (need more USDT when buy rate is lower).
   * sell = USDT→INR (limit consumption / display value).
   * Missing/invalid business override falls back to platform default.
   */
  resolveUsdtInrRate(
    side: UsdtRateSide = 'sell',
    business?: BusinessUsdtRates | null,
  ): number {
    const override =
      side === 'buy'
        ? Number(business?.usdtBuyInrRate)
        : Number(business?.usdtSellInrRate);
    if (Number.isFinite(override) && override > 0) {
      return override;
    }
    return this.getUsdtInrRate();
  }

  getQuote(business?: BusinessUsdtRates | null) {
    const buy = this.resolveUsdtInrRate('buy', business);
    const sell = this.resolveUsdtInrRate('sell', business);
    const usdtInr = sell;
    return {
      usdtInr,
      usdtBuyInr: buy,
      usdtSellInr: sell,
      pair: 'USDT/INR' as const,
      /** How much USDT is needed to pay this many INR */
      usdtForInr: (inrAmount: number) => this.inrToUsdt(inrAmount, business),
      /** How much INR you get for this many USDT */
      inrForUsdt: (usdtAmount: number) => this.usdtToInr(usdtAmount, business),
      updatedAt: new Date().toISOString(),
      source: business?.usdtBuyInrRate || business?.usdtSellInrRate ? ('business' as const) : ('config' as const),
    };
  }

  /** Convert INR payout → USDT debit (ceil to 6 dp so partner always covers). */
  inrToUsdt(inrAmount: number, business?: BusinessUsdtRates | null): number {
    const rate = this.resolveUsdtInrRate('buy', business);
    return Math.ceil((inrAmount / rate) * 1e6) / 1e6;
  }

  /** Convert INR budget → max USDT pay that still fits under remaining limit. */
  inrBudgetToUsdt(inrAmount: number, business?: BusinessUsdtRates | null): number {
    const rate = this.resolveUsdtInrRate('buy', business);
    if (!Number.isFinite(inrAmount) || inrAmount <= 0) return 0;
    return Math.floor((inrAmount / rate) * 1e6) / 1e6;
  }

  usdtToInr(usdtAmount: number, business?: BusinessUsdtRates | null): number {
    const rate = this.resolveUsdtInrRate('sell', business);
    return Math.round(usdtAmount * rate * 100) / 100;
  }
}
