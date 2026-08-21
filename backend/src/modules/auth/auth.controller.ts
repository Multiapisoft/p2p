import { Controller, Post, Body, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  SetPasswordDto,
  EnableTwoFactorDto,
  DisableTwoFactorDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** First-time partner users: set password without current. Others: require currentPassword. */
  @Post('set-password')
  setPassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPasswordDto) {
    return this.authService.setPassword(user.userId, dto);
  }

  @Get('2fa')
  twoFactorStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.twoFactorStatus(user.userId);
  }

  @Post('2fa/setup')
  setupTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.setupTwoFactor(user.userId);
  }

  @Post('2fa/enable')
  enableTwoFactor(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnableTwoFactorDto) {
    return this.authService.enableTwoFactor(user.userId, dto);
  }

  @Post('2fa/disable')
  disableTwoFactor(@CurrentUser() user: AuthenticatedUser, @Body() dto: DisableTwoFactorDto) {
    return this.authService.disableTwoFactor(user.userId, dto);
  }
}
