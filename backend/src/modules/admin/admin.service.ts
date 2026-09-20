import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UserRole } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/currency.enum';
import { UsersService } from '../users/users.service';
import { CreateSubAdminDto, UpdateSubAdminDto } from './dto/admin.dto';
import { Deposit, DepositDocument } from '../deposit/schemas/deposit.schema';
import { Withdrawal, WithdrawalDocument } from '../withdrawal/schemas/withdrawal.schema';
import { Business, BusinessDocument } from '../business/schemas/business.schema';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { CommissionService } from '../commission/commission.service';
import { CommissionTarget } from '../../common/enums/commission-target.enum';
import { assignedBusinessOids } from '../../common/utils/admin-business-scope.util';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Deposit.name) private depositModel: Model<DepositDocument>,
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    private config: ConfigService,
    private usersService: UsersService,
    private commissionService: CommissionService,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
    await this.seedInvestor();
    await this.seedDefaultCommissions();
  }

  private async seedInvestor() {
    // Live wipe / production: only admin seed — skip demo investor.
    if (this.config.get<string>('nodeEnv') === 'production') return;

    const email = this.config.get<string>('investor.email')!;
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) return;

    const password = this.config.get<string>('investor.password')!;
    const name = this.config.get<string>('investor.name')!;

    await this.userModel.create({
      email,
      password: await bcrypt.hash(password, 12),
      name,
      role: UserRole.INVESTOR,
      status: UserStatus.ACTIVE,
    });

    this.logger.log(`Default investor seeded: ${email}`);
  }

  private async seedAdmin() {
    const email = this.config.get<string>('admin.email')!;
    const password = this.config.get<string>('admin.password')!;
    const name = this.config.get<string>('admin.name')!;
    const hashed = await bcrypt.hash(password, 12);
    const existing = await this.userModel.findOne({ email }).exec();

    if (existing) {
      const nodeEnv = this.config.get<string>('nodeEnv');
      if (nodeEnv !== 'production') {
        await this.userModel.updateOne(
          { email },
          {
            $set: {
              password: hashed,
              name,
              role: UserRole.ADMIN,
              status: UserStatus.ACTIVE,
            },
          },
        );
        this.logger.log(`Admin credentials synced from env: ${email}`);
      }
      return;
    }

    await this.userModel.create({
      email,
      password: hashed,
      name,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });

    this.logger.log(`Default admin seeded: ${email}`);
  }

  private async seedDefaultCommissions() {
    const existing = await this.commissionService.findAll();
    if (existing.length > 0) return;

    await this.commissionService.create({
      targetType: CommissionTarget.PLATFORM,
      percentage: 1,
      fixedFee: 0,
      description: 'Default platform commission',
    });

    await this.commissionService.create({
      targetType: CommissionTarget.BUSINESS,
      percentage: 2,
      fixedFee: 0,
      description: 'Default business commission',
    });

    await this.commissionService.create({
      targetType: CommissionTarget.INVESTOR,
      percentage: 1.5,
      fixedFee: 0,
      description: 'Default investor commission on redemption',
    });

    this.logger.log('Default commission configs seeded');
  }

  async createSubAdmin(dto: CreateSubAdminDto, createdBy: string) {
    await this.assertBusinessIdsExist(dto.assignedBusinessIds);
    return this.usersService.create(
      {
        email: dto.email,
        password: dto.password,
        name: dto.name,
        role: UserRole.SUB_ADMIN,
        permissions: dto.permissions,
        assignedBusinessIds: dto.assignedBusinessIds,
      },
      createdBy,
    );
  }

  async updateSubAdmin(id: string, dto: UpdateSubAdminDto) {
    const user = await this.userModel.findById(id).exec();
    if (!user || user.role !== UserRole.SUB_ADMIN) {
      throw new NotFoundException('Sub-admin not found');
    }
    if (dto.assignedBusinessIds !== undefined) {
      await this.assertBusinessIdsExist(dto.assignedBusinessIds);
    }

    const patch: Partial<User> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.permissions !== undefined) patch.permissions = dto.permissions;
    if (dto.assignedBusinessIds !== undefined) {
      patch.assignedBusinessIds = assignedBusinessOids(dto.assignedBusinessIds);
    }
    if (dto.password?.trim()) {
      patch.password = await bcrypt.hash(dto.password.trim(), 12);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, { $set: patch }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Sub-admin not found');
    return this.usersService.findById(id);
  }

  private async assertBusinessIdsExist(ids?: string[]) {
    if (!ids?.length) return;
    const oids = assignedBusinessOids(ids);
    if (oids.length !== ids.length) {
      throw new BadRequestException('One or more business ids are invalid');
    }
    const count = await this.businessModel.countDocuments({ _id: { $in: oids } }).exec();
    if (count !== oids.length) {
      throw new BadRequestException('One or more businesses were not found');
    }
  }

  async listSubAdmins(page = 1, limit = 20) {
    return this.usersService.findAll({ page, limit, role: UserRole.SUB_ADMIN });
  }

  async updateUserStatus(userId: string, status: UserStatus) {
    return this.usersService.update(userId, { status });
  }

  async getDashboardStats(actor?: AuthenticatedUser) {
    const bizScope =
      actor?.role === UserRole.SUB_ADMIN
        ? {
            businessId: {
              $in: assignedBusinessOids(actor.assignedBusinessIds),
            },
          }
        : {};

    const [
      totalUsers,
      totalBusinesses,
      totalInvestors,
      pendingDeposits,
      pendingWithdrawals,
      completedDeposits,
      completedWithdrawals,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.USER }).exec(),
      actor?.role === UserRole.SUB_ADMIN
        ? this.businessModel
            .countDocuments({
              _id: { $in: assignedBusinessOids(actor.assignedBusinessIds) },
            })
            .exec()
        : this.businessModel.countDocuments().exec(),
      this.userModel.countDocuments({ role: UserRole.INVESTOR }).exec(),
      this.depositModel
        .countDocuments({ status: TransactionStatus.PENDING, ...bizScope })
        .exec(),
      this.withdrawalModel
        .countDocuments({ status: TransactionStatus.PENDING, ...bizScope })
        .exec(),
      this.depositModel.aggregate([
        { $match: { status: TransactionStatus.COMPLETED, ...bizScope } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.withdrawalModel.aggregate([
        { $match: { status: TransactionStatus.COMPLETED, ...bizScope } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      users: { total: totalUsers },
      businesses: { total: totalBusinesses },
      investors: { total: totalInvestors },
      deposits: {
        pending: pendingDeposits,
        totalCompleted: completedDeposits[0]?.total || 0,
      },
      withdrawals: {
        pending: pendingWithdrawals,
        totalCompleted: completedWithdrawals[0]?.total || 0,
      },
    };
  }
}
