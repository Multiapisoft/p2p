import { PlatformCommissionService } from './platform-commission.service';
import { Currency, LedgerDirection, LedgerFlow, LedgerType } from '../../common/enums/currency.enum';
import { UserRole } from '../../common/enums/role.enum';

describe('PlatformCommissionService', () => {
  const admin = {
    _id: { toString: () => 'admin-id' },
    name: 'Site Admin',
    email: 'admin@test.com',
    role: UserRole.ADMIN,
  };
  const wallet = {
    _id: { toString: () => 'wallet-id' },
    balance: 100,
    lockedBalance: 0,
    userId: { toString: () => 'admin-id' },
  };

  const walletService = {
    getOrCreate: jest.fn(),
    credit: jest.fn(),
    debit: jest.fn(),
  };
  const transactionService = {
    record: jest.fn(),
  };
  const usersRepo = {
    findByEmail: jest.fn(),
    findAll: jest.fn(),
  };
  const config = {
    get: jest.fn().mockReturnValue('admin@test.com'),
  };

  let service: PlatformCommissionService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersRepo.findByEmail.mockResolvedValue(admin);
    walletService.getOrCreate.mockResolvedValue({ ...wallet });
    walletService.credit.mockResolvedValue({ ...wallet, balance: 115 });
    walletService.debit.mockResolvedValue({ ...wallet, balance: 80 });
    transactionService.record.mockImplementation(async (p) => p);
    service = new PlatformCommissionService(
      walletService as never,
      transactionService as never,
      usersRepo as never,
      config as never,
    );
  });

  it('credits platform fee to admin wallet with from/to ledger', async () => {
    const entry = await service.creditPlatformFee({
      amount: 15,
      currency: Currency.INR,
      fromUserId: 'payer-1',
      fromName: 'Rahul',
      fromRole: 'user',
      referenceType: 'withdrawal_payment',
      referenceId: 'pay-id',
      referenceLabel: 'PAY-1',
    });

    expect(walletService.credit).toHaveBeenCalledWith('wallet-id', 15, false, undefined);
    expect(transactionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-id',
        type: LedgerType.COMMISSION,
        direction: LedgerDirection.CREDIT,
        flow: LedgerFlow.PLATFORM_FEE,
        amount: 15,
        counterpartyUserId: 'payer-1',
        fromParty: 'Rahul (user)',
        toParty: 'Site Admin (admin)',
      }),
    );
    expect(entry?.description).toContain('Platform fee ₹15 received from Rahul (user)');
  });

  it('credits business fee to admin wallet with matching ledger copy', async () => {
    const entry = await service.creditPlatformFee({
      amount: 8,
      currency: Currency.INR,
      fromUserId: 'payer-1',
      fromName: 'Rahul',
      fromRole: 'user',
      referenceType: 'deposit',
      referenceId: 'dep-id',
      referenceLabel: 'DEP-1',
      kind: 'business',
    });

    expect(walletService.credit).toHaveBeenCalledWith('wallet-id', 8, false, undefined);
    expect(entry?.description).toContain('Business fee ₹8 received from Rahul (user)');
  });

  it('credits platform then business fees sequentially', async () => {
    await service.creditCollectedFees({
      platformAmount: 10,
      businessAmount: 5,
      fromUserId: 'payer-1',
      fromName: 'Rahul',
      fromRole: 'user',
      referenceType: 'deposit',
      referenceId: 'dep-id',
      referenceLabel: 'DEP-1',
    });

    expect(walletService.credit).toHaveBeenNthCalledWith(1, 'wallet-id', 10, false, undefined);
    expect(walletService.credit).toHaveBeenNthCalledWith(2, 'wallet-id', 5, false, undefined);
    expect(transactionService.record).toHaveBeenCalledTimes(2);
  });

  it('credits deposit given to on admin commission wallet', async () => {
    walletService.credit.mockResolvedValue({ ...wallet, balance: 2100 });
    const entry = await service.creditDepositGivenTo({
      amount: 2000,
      currency: Currency.INR,
      toUserId: 'user-1',
      toName: 'Rahul',
      toRole: 'user',
      fromName: 'Acme Biz',
      fromRole: UserRole.BUSINESS,
      referenceType: 'withdrawal',
      referenceId: 'wd-id',
      referenceLabel: 'WDR-1',
    });

    expect(walletService.credit).toHaveBeenCalledWith('wallet-id', 2000, false, undefined);
    expect(transactionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-id',
        type: LedgerType.DEPOSIT,
        direction: LedgerDirection.CREDIT,
        amount: 2000,
        counterpartyUserId: 'user-1',
        fromParty: 'Acme Biz (business)',
        toParty: 'Rahul (user)',
      }),
    );
    expect(entry?.description).toContain('Deposit given to Rahul (user) ₹2000');
  });

  it('skips zero platform fee', async () => {
    await expect(
      service.creditPlatformFee({
        amount: 0,
        fromUserId: 'x',
        fromName: 'x',
        referenceType: 'deposit',
        referenceId: 'd',
        referenceLabel: 'DEP-1',
      }),
    ).resolves.toBeNull();
    expect(walletService.credit).not.toHaveBeenCalled();
  });

  it('debits investor commission from admin wallet (overdraft allowed)', async () => {
    await service.debitInvestorCommission({
      amount: 20,
      toUserId: 'inv-1',
      toName: 'Anita',
      toRole: UserRole.INVESTOR,
      referenceType: 'withdrawal_payment_bonus',
      referenceId: 'pay-id',
      referenceLabel: 'PAY-1',
    });

    expect(walletService.debit).toHaveBeenCalledWith(
      'wallet-id',
      20,
      false,
      undefined,
      { allowOverdraft: true },
    );
    expect(transactionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-id',
        direction: LedgerDirection.DEBIT,
        flow: LedgerFlow.INVESTOR_COMMISSION,
        counterpartyUserId: 'inv-1',
        fromParty: 'Site Admin (admin)',
        toParty: 'Anita (investor)',
      }),
    );
  });
});
