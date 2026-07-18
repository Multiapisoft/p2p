import { IsOptional, IsUrl, ValidateIf } from 'class-validator';

/**
 * Minimal setup: only `baseUrl` (e.g. https://api.partner.com).
 * Advanced: pass full balance/credit/debit URLs instead.
 */
export class PartnerApiDto {
  /** Partner API origin — auto-expands to /api/p2p/partner/{balance,credit,debit} */
  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @ValidateIf((o: PartnerApiDto) => !o.baseUrl)
  @IsUrl({ require_tld: false })
  balanceUrl?: string;

  @ValidateIf((o: PartnerApiDto) => !o.baseUrl)
  @IsUrl({ require_tld: false })
  creditUrl?: string;

  @ValidateIf((o: PartnerApiDto) => !o.baseUrl)
  @IsUrl({ require_tld: false })
  debitUrl?: string;
}

export class UpdatePartnerApiDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @ValidateIf((o: UpdatePartnerApiDto) => !o.baseUrl)
  @IsUrl({ require_tld: false })
  balanceUrl?: string;

  @ValidateIf((o: UpdatePartnerApiDto) => !o.baseUrl)
  @IsUrl({ require_tld: false })
  creditUrl?: string;

  @ValidateIf((o: UpdatePartnerApiDto) => !o.baseUrl)
  @IsUrl({ require_tld: false })
  debitUrl?: string;
}
