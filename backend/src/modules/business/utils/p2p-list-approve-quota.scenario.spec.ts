import {
  listApprovalHeadroomError,
  listApprovalHeadroomNeeded,
} from '../../withdrawal/utils/list-approval-fee-headroom.util';
import {
  p2pPayQuotaRemaining,
  remainingForPayingListedWithdrawal,
} from './p2p-pay-quota.util';

/**
 * End-to-end product math for list/approve (#7):
 * remaining must cover new open + fees on listed opens + new fee.
 * After list, pay path adds back this WD's reserve so pay is not double-blocked.
 */
describe('P2P list approve + pay quota — complex chain', () => {
  const feePercent = 5;
  const feeOf = (open: number) => Math.round(((open * feePercent) / 100) * 100) / 100;

  it('scenario: Biz has remaining 50k; two listed opens; third approve blocked then unblocked', () => {
    // Seeded limit 40k + earned 15k - used 5k = remaining 50k
    const remaining = p2pPayQuotaRemaining({
      p2pPayLimit: 40_000,
      p2pPayEarned: 15_000,
      p2pPayUsed: 5_000,
    });
    expect(remaining).toBe(50_000);

    const listedOpens = [20_000, 15_000]; // fees 1000 + 750
    const existingFees = listedOpens.reduce((s, o) => s + feeOf(o), 0);
    expect(existingFees).toBe(1_750);

    // Try approve 30k open → need 30000 + 1750 + 1500 = 33250 ≤ 50000 → OK
    const okNeeded = listApprovalHeadroomNeeded({
      newOpenInr: 30_000,
      newWithdrawalFee: feeOf(30_000),
      existingListedOpenFees: existingFees,
    });
    expect(okNeeded).toBe(33_250);
    expect(okNeeded <= remaining).toBe(true);

    // After listing 30k, used increases by 30k → remaining becomes 20k
    const remainingAfterList = p2pPayQuotaRemaining({
      p2pPayLimit: 40_000,
      p2pPayEarned: 15_000,
      p2pPayUsed: 5_000 + 30_000,
    });
    expect(remainingAfterList).toBe(20_000);

    // Fourth approve 19k: existing fees now include 30k fee too
    const feesAfter = existingFees + feeOf(30_000); // 1750 + 1500 = 3250
    const fourthNeeded = listApprovalHeadroomNeeded({
      newOpenInr: 19_000,
      newWithdrawalFee: feeOf(19_000),
      existingListedOpenFees: feesAfter,
    });
    // 19000 + 950 + 3250 = 23200 > 20000 → blocked
    expect(fourthNeeded).toBe(23_200);
    expect(fourthNeeded <= remainingAfterList).toBe(false);
    expect(
      listApprovalHeadroomError({
        needed: fourthNeeded,
        remaining: remainingAfterList,
        newOpenInr: 19_000,
        feesTotal: feesAfter + feeOf(19_000),
      }),
    ).toContain('Cannot approve');
  });

  it('after list, paying the same WD uses remainingForPayingListedWithdrawal headroom', () => {
    // List reserved 10k; remaining now 500. Pay of this WD must still be allowed.
    const remaining = 500;
    const listReserve = 10_000;
    const effective = remainingForPayingListedWithdrawal(remaining, listReserve);
    expect(effective).toBe(10_500);
    expect(10_000 <= effective).toBe(true);
  });
});
