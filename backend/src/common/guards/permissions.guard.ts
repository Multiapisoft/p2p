import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../enums/permission.enum';
import { UserRole } from '../enums/role.enum';
import type { AuthenticatedUser } from '../interfaces/jwt-payload.interface';
import { UsersRepository } from '../../modules/users/users.repository';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersRepo: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    if (user.role === UserRole.ADMIN) return true;

    if (user.role !== UserRole.SUB_ADMIN) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const dbUser = await this.usersRepo.findById(user.userId);
    const userPermissions = dbUser?.permissions || [];
    const hasAll = required.every((p) => userPermissions.includes(p));
    if (!hasAll) throw new ForbiddenException('Missing required permissions');
    return true;
  }
}
