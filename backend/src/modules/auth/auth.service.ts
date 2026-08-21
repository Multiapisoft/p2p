import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { BusinessService } from '../business/business.service';
import { LoginDto, RegisterDto, SetPasswordDto, EnableTwoFactorDto, DisableTwoFactorDto } from './dto/auth.dto';
import { UserRole } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/currency.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { UsersRepository } from '../users/users.repository';
import {
  buildOtpauthUrl,
  generateTotpSecret,
  verifyTotp,
} from './utils/totp.util';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private usersRepo: UsersRepository,
    private businessService: BusinessService,
    private jwtService: JwtService,
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
