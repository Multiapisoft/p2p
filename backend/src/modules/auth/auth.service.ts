import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { BusinessService } from '../business/business.service';
import { AuditService } from '../audit/audit.service';
import {
  LoginDto,
  RegisterDto,
  SetPasswordDto,
  EnableTwoFactorDto,
  DisableTwoFactorDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { UserRole } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/currency.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { Permission } from '../../common/enums/permission.enum';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { UsersRepository } from '../users/users.repository';
import {
  buildOtpauthUrl,
  generateTotpSecret,
  verifyTotp,
} from './utils/totp.util';
import { subAdminBusinessIdsOrEmpty } from '../../common/utils/admin-business-scope.util';

const LOGIN_AS_PERM: Partial<Record<UserRole, Permission>> = {
  [UserRole.USER]: Permission.LOGIN_AS_USER,
  [UserRole.INVESTOR]: Permission.LOGIN_AS_INVESTOR,
  [UserRole.BUSINESS]: Permission.LOGIN_AS_BUSINESS,
};

const RESET_TTL_MS = 15 * 60 * 1000;
const FORGOT_GENERIC =
  'If an account exists for that email, a reset code has been issued.';

const IMPERSONATABLE = new Set<UserRole>([
  UserRole.USER,
  UserRole.BUSINESS,
  UserRole.INVESTOR,
]);

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private usersRepo: UsersRepository,
    private businessService: BusinessService,
    private jwtService: JwtService,
    private config: ConfigService,
    private auditService: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const allowedSelfRegister = [UserRole.USER, UserRole.BUSINESS, UserRole.INVESTOR];
    const role = dto.role && allowedSelfRegister.includes(dto.role) ? dto.role : UserRole.USER;
    const email = dto.email.trim().toLowerCase();

    // End users must join via business code (or use integration API keys / portal token instead)
    if (role === UserRole.USER && !dto.referralCode?.trim()) {
      throw new BadRequestException(
        'Business code is required. Open the invite link from your business, or use their integration portal.',
      );
    }

    await this.usersService.create({
      email,
      password: dto.password,
      name: dto.name.trim(),
      phone: dto.phone,
      role,
      referralCode: dto.referralCode?.trim(),
    });

    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Registration failed');

    const token = this.generateToken(user);

    // Business signup: create entity + referral/business code immediately (no partner URLs required)
    if (role === UserRole.BUSINESS) {
      const created = await this.businessService.create(user._id.toString(), {
        name: (dto.businessName || dto.name).trim(),
        allowedPaymentMethods: Object.values(PaymentMethod),
      });
      return {
        ...token,
        referralCode: created.referralCode,
        business: created.business,
        apiKey: created.apiKey,
        apiSecret: created.apiSecret,
        internalSecret: created.internalSecret,
      };
    }

    return token;
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersRepo.findByEmailWithSecrets(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    const valid = await this.usersService.validatePassword(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.twoFactorEnabled) {
      if (!dto.totpCode) {
        throw new UnauthorizedException({
          message: 'Two-factor authentication code required',
          code: 'REQUIRES_2FA',
        });
      }
      if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, dto.totpCode)) {
        throw new UnauthorizedException('Invalid two-factor code');
      }
    }

    await this.usersRepo.update(user._id.toString(), { lastLoginAt: new Date() });

    return this.generateToken(user);
  }

  /**
   * Issues a 6-digit reset code (15 min). No SMTP yet — code is returned in the
   * response so panels can complete reset; swap to email when mailer is wired.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersRepo.findByEmail(email);
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { message: FORGOT_GENERIC };
    }

    const code = String(randomInt(100000, 999999));
    const passwordResetCodeHash = createHash('sha256').update(code).digest('hex');
    await this.usersRepo.update(user._id.toString(), {
      passwordResetCodeHash,
      passwordResetExpires: new Date(Date.now() + RESET_TTL_MS),
    });

    return { message: FORGOT_GENERIC, resetCode: code };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersRepo.findByEmailWithReset(email);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Invalid or expired reset code');
    }
    if (!user.passwordResetCodeHash || !user.passwordResetExpires) {
      throw new BadRequestException('Invalid or expired reset code');
    }
    if (user.passwordResetExpires.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const incomingHash = createHash('sha256').update(dto.code.trim()).digest('hex');
    const a = Buffer.from(incomingHash, 'utf8');
    const b = Buffer.from(user.passwordResetCodeHash, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    await this.usersRepo.resetPasswordAfterCode(user._id.toString(), hashedPassword);

    return { message: 'Password updated. You can sign in with your new password.' };
  }

  async twoFactorStatus(userId: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return { enabled: !!user.twoFactorEnabled };
  }

  async setupTwoFactor(userId: string) {
    const user = await this.usersRepo.findByIdWithSecrets(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    const secret = generateTotpSecret();
    await this.usersRepo.update(userId, { twoFactorSecret: secret, twoFactorEnabled: false });
    return {
      secret,
      otpauthUrl: buildOtpauthUrl({ secret, email: user.email, issuer: 'PaySecure247' }),
    };
  }

  async enableTwoFactor(userId: string, dto: EnableTwoFactorDto) {
    const user = await this.usersRepo.findByIdWithSecrets(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, dto.code)) {
      throw new BadRequestException('Invalid two-factor code');
    }
    await this.usersRepo.update(userId, { twoFactorEnabled: true });
    return { enabled: true };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.usersRepo.findByIdWithSecrets(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    const valid = await this.usersService.validatePassword(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, dto.code)) {
      throw new BadRequestException('Invalid two-factor code');
    }
    await this.usersRepo.clearTwoFactor(userId);
    return { enabled: false };
  }

  async setPassword(userId: string, dto: SetPasswordDto) {
    await this.usersService.setPassword(userId, dto);
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return this.generateToken(user);
  }

  /**
   * Admin/sub-admin: login as user / investor / business owner.
   * Business: login as their linked end-users only.
   */
  async impersonate(actor: AuthenticatedUser, targetUserId: string) {
    const target = await this.usersRepo.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');
    if (target.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Target account is not active');
    }
    if (!IMPERSONATABLE.has(target.role)) {
      throw new ForbiddenException('Cannot login as this role');
    }
    if (target._id.toString() === actor.userId) {
      throw new BadRequestException('Already logged in as this account');
    }

    if (actor.role === UserRole.ADMIN || actor.role === UserRole.SUB_ADMIN) {
      if (actor.role === UserRole.SUB_ADMIN) {
        const need = LOGIN_AS_PERM[target.role];
        if (!need || !(actor.permissions ?? []).includes(need)) {
          throw new ForbiddenException(
            `Not allowed to login as ${target.role}. Ask admin for login_as permission.`,
          );
        }
        if (target.role === UserRole.USER) {
          const allowed = subAdminBusinessIdsOrEmpty(actor) || [];
          const bizId = target.referredByBusiness?.toString();
          if (!bizId || !allowed.includes(bizId)) {
            throw new ForbiddenException('User is outside your assigned businesses');
          }
        }
        if (target.role === UserRole.BUSINESS) {
          const allowed = subAdminBusinessIdsOrEmpty(actor) || [];
          const biz = await this.businessService
            .findDocumentByOwner(target._id.toString())
            .catch(() => null);
          if (!biz || !allowed.includes(biz._id.toString())) {
            throw new ForbiddenException('Business is outside your assigned scope');
          }
        }
      }
    } else if (actor.role === UserRole.BUSINESS) {
      if (target.role !== UserRole.USER) {
        throw new ForbiddenException('Business can only login as linked users');
      }
      const biz = await this.businessService.findDocumentByOwner(actor.userId);
      if (target.referredByBusiness?.toString() !== biz._id.toString()) {
        throw new ForbiddenException('User is not linked to your business');
      }
    } else {
      throw new ForbiddenException('Not allowed to impersonate');
    }

    const session = this.generateToken(target);
    const panelUrl = this.panelUrlForRole(target.role);
    const loginUrl = `${panelUrl.replace(/\/$/, '')}/impersonate?token=${encodeURIComponent(session.accessToken)}`;

    await this.auditService.log({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: 'auth.impersonate',
      resource: 'user',
      resourceId: target._id.toString(),
      metadata: {
        targetEmail: target.email,
        targetRole: target.role,
        actorRole: actor.role,
      },
    });

    return {
      ...session,
      panelUrl,
      loginUrl,
      impersonatedBy: { userId: actor.userId, email: actor.email, role: actor.role },
    };
  }

  /** Admin shortcut: open business panel as the business owner. */
  async impersonateBusinessOwner(actor: AuthenticatedUser, businessId: string) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUB_ADMIN) {
      throw new ForbiddenException('Only admin can login as a business');
    }
    if (
      actor.role === UserRole.SUB_ADMIN &&
      !(actor.permissions ?? []).includes(Permission.LOGIN_AS_BUSINESS)
    ) {
      throw new ForbiddenException(
        'Not allowed to login as business. Ask admin for login_as.business permission.',
      );
    }
    const business = await this.businessService.findDocumentById(businessId);
    if (actor.role === UserRole.SUB_ADMIN) {
      const allowed = subAdminBusinessIdsOrEmpty(actor) || [];
      if (!allowed.includes(business._id.toString())) {
        throw new ForbiddenException('Business is outside your assigned scope');
      }
    }
    const ownerId = business.ownerId?.toString();
    if (!ownerId) throw new BadRequestException('Business has no owner');
    return this.impersonate(actor, ownerId);
  }

  private panelUrlForRole(role: UserRole): string {
    if (role === UserRole.BUSINESS) {
      return this.config.get<string>('app.businessAppUrl') || 'http://localhost:5180';
    }
    if (role === UserRole.INVESTOR) {
      return this.config.get<string>('app.investorAppUrl') || 'http://localhost:7194';
    }
    return this.config.get<string>('app.userAppUrl') || 'http://localhost:4761';
  }

  private generateToken(user: {
    _id: { toString(): string };
    email: string;
    name?: string;
    role: UserRole;
    permissions?: string[];
    mustSetPassword?: boolean;
    twoFactorEnabled?: boolean;
    staffBusinessId?: { toString(): string } | string;
  }) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const staffBusinessId =
      typeof user.staffBusinessId === 'string'
        ? user.staffBusinessId
        : user.staffBusinessId?.toString() || null;

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name || '',
        role: user.role,
        permissions: user.permissions ?? [],
        mustSetPassword: !!user.mustSetPassword,
        twoFactorEnabled: !!user.twoFactorEnabled,
        staffBusinessId,
        isBusinessOwner: user.role === UserRole.BUSINESS && !staffBusinessId,
      },
    };
  }
}
