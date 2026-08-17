import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { JwtService } from '@nestjs/jwt';
import {
  IntegrationRedirectSession,
  IntegrationRedirectDocument,
  IntegrationRedirectType,
  IntegrationRedirectStatus,
} from './schemas/integration-redirect.schema';
import { CreateRedirectDto, CreatePortalRedirectDto } from './dto/integration-redirect.dto';
import type { BusinessDocument } from '../business/schemas/business.schema';
import { UsersService } from '../users/users.service';
import { UsersRepository } from '../users/users.repository';
import { UserStatus } from '../../common/enums/currency.enum';
import { Currency } from '../../common/enums/currency.enum';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { UserRole } from '../../common/enums/role.enum';

@Injectable()
export class IntegrationRedirectService {
  constructor(
    @InjectModel(IntegrationRedirectSession.name)
    private sessionModel: Model<IntegrationRedirectDocument>,
    private config: ConfigService,
    private usersService: UsersService,
    private usersRepo: UsersRepository,
    private jwtService: JwtService,
  ) {}

  async createDepositRedirect(business: BusinessDocument, dto: CreateRedirectDto) {
    return this.createSession(business, dto, IntegrationRedirectType.DEPOSIT);
  }

  async createWithdrawalRedirect(business: BusinessDocument, dto: CreateRedirectDto) {
    return this.createSession(business, dto, IntegrationRedirectType.WITHDRAWAL);
  }

  /** SSO launch into user portal (no deposit/withdrawal amount required). */
  async createPortalRedirect(business: BusinessDocument, dto: CreatePortalRedirectDto) {
    return this.createSession(
      business,
      {
        userId: dto.userId,
        amount: 0,
        returnUrl: dto.returnUrl,
        externalRef: dto.externalRef,
        isNewUser: dto.isNewUser,
        initialPassword: dto.initialPassword,
      },
      IntegrationRedirectType.PORTAL,
    );
  }

  private async createSession(
    business: BusinessDocument,
    dto: {
      userId: string;
      amount: number;
      returnUrl?: string;
      externalRef?: string;
      isNewUser?: boolean;
      initialPassword?: string;
    },
    type: IntegrationRedirectType,
  ) {
    const user = await this.usersRepo.findById(dto.userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.referredByBusiness?.toString() !== business._id.toString()) {
      throw new ForbiddenException('User does not belong to this business');
    }

    const token = `rd_${uuidv4().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const userAppUrl = this.config.get<string>('app.userAppUrl') || 'http://localhost:4761';

    // Mongoose treats '' as missing for required String — always keep a usable URL
    const returnUrl =
      (dto.returnUrl && dto.returnUrl.trim()) ||
      business.integrationUrls?.returnUrl?.trim() ||
      business.integrationUrls?.partnerSiteUrl?.trim() ||
      userAppUrl;

    const session = await this.sessionModel.create({
      token,
      type,
      userId: new Types.ObjectId(dto.userId),
      businessId: business._id,
      amount: dto.amount ?? 0,
      currency: Currency.INR,
      returnUrl,
      externalRef: dto.externalRef,
      isNewUser: !!dto.isNewUser,
      initialPassword: dto.isNewUser && dto.initialPassword ? dto.initialPassword : undefined,
      status: IntegrationRedirectStatus.PENDING,
      expiresAt,
    });

    const path =
      type === IntegrationRedirectType.DEPOSIT
        ? 'deposit'
        : type === IntegrationRedirectType.WITHDRAWAL
          ? 'withdrawal'
          : 'portal';
    const redirectUrl = `${userAppUrl.replace(/\/$/, '')}/integration/${path}?token=${token}`;

    return {
      token: session.token,
      redirectUrl,
      type: session.type,
      amount: session.amount,
      expiresAt: session.expiresAt,
      userId: dto.userId,
    };
  }

  async getSession(token: string) {
    const session = await this.findValidSession(token, true);
    const user = await this.usersService.findById(session.userId.toString());
    return {
      token: session.token,
      type: session.type,
      amount: session.amount,
      currency: session.currency,
      returnUrl: session.returnUrl,
      externalRef: session.externalRef,
      status: session.status,
      expiresAt: session.expiresAt,
      isNewUser: !!session.isNewUser,
      // One-time credentials for first partner register (cleared on claim)
      initialPassword: session.initialPassword || undefined,
      user: user
        ? {
            id: String(user._id),
            email: String(user.email ?? ''),
            name: String(user.name ?? ''),
          }
        : null,
    };
  }

  async claimSession(token: string) {
    const session = await this.findValidSession(token, true);
    const user = await this.usersRepo.findById(session.userId.toString());
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is not active');
    }

    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role as UserRole,
    };

    const wasNewUser = !!session.isNewUser || !!user.mustSetPassword;

    // Portal SSO: consume link so credentials are not shown again
    if (session.type === IntegrationRedirectType.PORTAL) {
      session.status = IntegrationRedirectStatus.COMPLETED;
      session.initialPassword = undefined;
      session.isNewUser = false;
      await session.save();
    }

    await this.usersRepo.update(user._id.toString(), { lastLoginAt: new Date() });

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        mustSetPassword: !!user.mustSetPassword,
      },
      session: {
        token: session.token,
        type: session.type,
        amount: session.amount,
        returnUrl: session.returnUrl,
        externalRef: session.externalRef,
        isNewUser: wasNewUser,
      },
    };
  }

  async consumeSession(token: string, userId: string, resultId: string, resultReferenceId: string) {
    const session = await this.findValidSession(token);
    if (session.userId.toString() !== userId) {
      throw new ForbiddenException('Session does not belong to this user');
    }

    session.status = IntegrationRedirectStatus.COMPLETED;
    session.resultId = resultId;
    session.resultReferenceId = resultReferenceId;
    await session.save();

    return session;
  }

  async findValidSession(token: string, withPassword = false) {
    const q = this.sessionModel.findOne({ token });
    if (withPassword) q.select('+initialPassword');
    const session = await q.exec();
    if (!session) throw new NotFoundException('Invalid or expired redirect link');
    if (session.status !== IntegrationRedirectStatus.PENDING) {
      throw new BadRequestException('Redirect link already used');
    }
    if (session.expiresAt < new Date()) {
      session.status = IntegrationRedirectStatus.EXPIRED;
      await session.save();
      throw new BadRequestException('Redirect link expired');
    }
    return session;
  }
}
