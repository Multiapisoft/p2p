import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WithdrawalPaymentService } from './withdrawal-payment.service';

@Injectable()
export class WithdrawalPaymentCronService {
  private readonly logger = new Logger(WithdrawalPaymentCronService.name);

  constructor(private paymentService: WithdrawalPaymentService) {}

  /** Drop expired Pay holds so the request reappears on every live list. */
  @Cron('*/30 * * * * *')
  async releaseExpiredClaims() {
    try {
      const n = await this.paymentService.releaseExpiredClaims();
      if (n) {
        this.logger.log(`Released ${n} expired P2P claim hold(s)`);
      }
    } catch (err) {
      this.logger.error(
        `Cron releaseExpiredClaims failed (kept alive): ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
    }
  }

  /** Every 5 minutes — unlock approved investments after 24h verification window. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoApproveAfterVerification() {
    try {
      const done = await this.paymentService.autoApproveDuePayments();
      if (done.length) {
        this.logger.log(`Auto-approved ${done.length} payment(s) after 24h window`);
      }
    } catch (err) {
      this.logger.error(
        `Cron autoApproveDuePayments failed (kept alive): ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
    }
  }
}
