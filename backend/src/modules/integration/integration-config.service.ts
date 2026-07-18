import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BusinessDocument } from '../business/schemas/business.schema';
import type { IntegrationUrls } from '../business/schemas/integration-urls.schema';

function joinUrl(base: string | undefined, path: string | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!base) return path.startsWith('/') ? path : `/${path}`;
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

@Injectable()
export class IntegrationConfigService {
  constructor(private config: ConfigService) {}

  buildForBusiness(business: BusinessDocument, apiBaseUrl?: string) {
    const apiBase =
      apiBaseUrl ||
      this.config.get<string>('app.publicApiUrl') ||
      `http://localhost:${this.config.get<number>('port') || 9091}/api/v1`;

    const userAppUrl = this.config.get<string>('app.userAppUrl') || 'http://localhost:5174';
    const urls: IntegrationUrls = business.integrationUrls || {};
    const partnerBase = urls.partnerSiteUrl?.replace(/\/$/, '') || '';

    const endpoints = {
      verify: `${apiBase}/integration/verify`,
      registerUser: `${apiBase}/integration/users`,
      listUsers: `${apiBase}/integration/users`,
      lookupUser: `${apiBase}/integration/users/lookup`,
      getUser: `${apiBase}/integration/users/{userId}`,
      userBalance: `${apiBase}/integration/users/{userId}/balance`,
      creditUser: `${apiBase}/integration/users/{userId}/credit`,
      debitUser: `${apiBase}/integration/users/{userId}/debit`,
      redirectDeposit: `${apiBase}/integration/redirect/deposit`,
      redirectWithdrawal: `${apiBase}/integration/redirect/withdrawal`,
      redirectPortal: `${apiBase}/integration/redirect/portal`,
      cancelDeposit: `${apiBase}/integration/deposits/{referenceId}/cancel`,
      cancelWithdrawal: `${apiBase}/integration/withdrawals/{referenceId}/cancel`,
      createDeposit: `${apiBase}/deposits/integration`,
      getDeposit: `${apiBase}/integration/deposits/{referenceId}`,
      testWebhook: `${apiBase}/integration/webhook/test`,
    };

    return {
      businessId: business._id.toString(),
      businessName: business.name,
      apiBaseUrl: apiBase,
      userPanelUrl: userAppUrl,
      webhookUrl: business.webhookUrl || null,
      partnerSite: {
        baseUrl: urls.partnerSiteUrl || null,
        returnUrl: urls.returnUrl || null,
        balancePage: joinUrl(partnerBase, urls.balancePageUrl),
        creditPage: joinUrl(partnerBase, urls.creditPageUrl),
        debitPage: joinUrl(partnerBase, urls.debitPageUrl),
      },
      integrationUrls: urls,
      partnerApi: {
        baseUrl: business.partnerApi?.baseUrl || null,
        balanceUrl: business.partnerApi?.balanceUrl || null,
        creditUrl: business.partnerApi?.creditUrl || null,
        debitUrl: business.partnerApi?.debitUrl || null,
        apiKey: business.partnerApi?.apiKey || null,
        configured: this.partnerApiConfigured(business),
      },
      endpoints,
      requiresInternalSecret: !!business.internalSecretHash,
      headers: {
        apiKey: 'X-Api-Key',
        apiSecret: 'X-Api-Secret',
        internalSecret: 'X-Internal-Secret',
      },
      secureEndpoints: [
        'lookupUser',
        'getUser',
        'userBalance',
        'creditUser',
        'debitUser',
        'redirectDeposit',
        'redirectWithdrawal',
        'redirectPortal',
        'cancelDeposit',
        'cancelWithdrawal',
        'createDeposit',
      ],
      flow: [
        '1. FinGuard: paste partner balance / credit / debit URLs (each partner can differ)',
        '2. Copy API keys into partner .env (P2P_API_*)',
        '3. User opens P2P from partner → SSO login; balance via partner API',
      ],
      partnerMinimalSetup: {
        envVars: ['P2P_API_URL', 'P2P_API_KEY', 'P2P_API_SECRET', 'P2P_INTERNAL_SECRET'],
        note: 'Partner exposes their own wallet URLs; FinGuard stores whatever they provide.',
      },
    };
  }

  private partnerApiConfigured(business: BusinessDocument) {
    return !!(
      business.partnerApi?.balanceUrl &&
      business.partnerApi?.creditUrl &&
      business.partnerApi?.debitUrl &&
      business.partnerApi?.apiKey &&
      business.partnerApi?.apiSecret
    );
  }
}
