import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { BusinessService } from '../../modules/business/business.service';
import type { BusinessApiRequest } from './api-key.guard';

@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(private businessService: BusinessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BusinessApiRequest>();
    const business = request.business;
    if (!business) {
      throw new UnauthorizedException('Business context required');
    }

    if (!business.internalSecretHash) {
      throw new UnauthorizedException(
        'Internal secret not configured. Regenerate credentials from the business panel.',
      );
    }

    const internalSecret = request.headers['x-internal-secret'] as string;

    if (!internalSecret) {
      throw new UnauthorizedException('X-Internal-Secret required for wallet operations');
    }

    const valid = await this.businessService.validateInternalSecret(business, internalSecret);
    if (!valid) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    return true;
  }
}
