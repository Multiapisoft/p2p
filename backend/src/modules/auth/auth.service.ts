import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto, SetPasswordDto } from './dto/auth.dto';
import { UserRole } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/currency.enum';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { UsersRepository } from '../users/users.repository';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private usersRepo: UsersRepository,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const allowedSelfRegister = [UserRole.USER, UserRole.BUSINESS, UserRole.INVESTOR];
    const role = dto.role && allowedSelfRegister.includes(dto.role) ? dto.role : UserRole.USER;

    await this.usersService.create({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      phone: dto.phone,
      role,
      referralCode: dto.referralCode,
    });

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Registration failed');

    return this.generateToken(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    const valid = await this.usersService.validatePassword(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.usersRepo.update(user._id.toString(), { lastLoginAt: new Date() });

    return this.generateToken(user);
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
    role: UserRole;
    permissions?: string[];
    mustSetPassword?: boolean;
  }) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        permissions: user.permissions ?? [],
        mustSetPassword: !!user.mustSetPassword,
      },
    };
  }
}
