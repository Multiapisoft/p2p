import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WithdrawalPaymentService } from './withdrawal-payment.service';

@Injectable()
export class WithdrawalPaymentCronService {
  private readonly logger = new Logger(WithdrawalPaymentCronService.name);

  constructor(private paymentService: WithdrawalPaymentService) {}

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
