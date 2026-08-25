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
  const adminWallet = {
    _id: { toString: () => 'admin-wallet' },
    balance: 100,
    lockedBalance: 0,
    userId: { toString: () => 'admin-id' },
  };
  const bizWallet = {
    _id: { toString: () => 'biz-wallet' },
    balance: 500,
    lockedBalance: 0,
    userId: { toString: () => 'owner-1' },
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
    walletService.getOrCreate.mockImplementation(async (userId: string) => {
      if (userId === 'owner-1') return { ...bizWallet };
      return { ...adminWallet };
    });
    walletService.credit.mockResolvedValue({ ...adminWallet, balance: 115 });
    walletService.debit.mockResolvedValue({ ...bizWallet, balance: 480 });
    transactionService.record.mockImplementation(async (p) => p);
    const businessModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: { toString: () => 'biz-1' },
          name: 'Acme Biz',
          ownerId: { toString: () => 'owner-1' },
        }),
      }),
    };
    service = new PlatformCommissionService(
      walletService as never,
      transactionService as never,
      usersRepo as never,
      config as never,
      businessModel as never,
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

    expect(walletService.credit).toHaveBeenCalledWith('admin-wallet', 15, false, undefined);
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

    expect(walletService.credit).toHaveBeenCalledWith('admin-wallet', 8, false, undefined);
    expect(entry?.description).toContain('Business fee ₹8 received from Rahul (user)');
  });

  it('without businessId credits platform then business fees to admin only', async () => {
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

    expect(walletService.debit).not.toHaveBeenCalled();
    expect(walletService.credit).toHaveBeenNthCalledWith(1, 'admin-wallet', 10, false, undefined);
    expect(walletService.credit).toHaveBeenNthCalledWith(2, 'admin-wallet', 5, false, undefined);
    expect(transactionService.record).toHaveBeenCalledTimes(2);
  });

  it('with businessId debits business wallet then credits admin', async () => {
    await service.creditCollectedFees({
      platformAmount: 10,
      businessAmount: 5,
      fromUserId: 'payer-1',
      fromName: 'Rahul',
      fromRole: 'user',
      referenceType: 'deposit',
      referenceId: 'dep-id',
      referenceLabel: 'DEP-1',
      businessId: 'biz-1',
    });

    expect(walletService.debit).toHaveBeenCalledTimes(2);
    expect(walletService.debit).toHaveBeenCalledWith(
      'biz-wallet',
      10,
      false,
      undefined,
      { allowOverdraft: true },
    );
    expect(walletService.credit).toHaveBeenCalledTimes(2);
    expect(transactionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        direction: LedgerDirection.DEBIT,
        amount: 10,
        description: expect.stringContaining('Platform fee ₹10 paid to'),
      }),
    );
    expect(transactionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-id',
        direction: LedgerDirection.CREDIT,
        fromParty: 'Acme Biz (business)',
      }),
    );
  });

  it('credits deposit given to on admin commission wallet', async () => {
    walletService.credit.mockResolvedValue({ ...adminWallet, balance: 2100 });
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

    expect(walletService.credit).toHaveBeenCalledWith('admin-wallet', 2000, false, undefined);
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
      'admin-wallet',
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
