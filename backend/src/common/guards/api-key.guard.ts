import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { BusinessService } from '../../modules/business/business.service';
import { Request } from 'express';
import type { BusinessDocument } from '../../modules/business/schemas/business.schema';

export interface BusinessApiRequest extends Request {
  business?: BusinessDocument;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private businessService: BusinessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BusinessApiRequest>();
    const apiKey = request.headers['x-api-key'] as string;
    const apiSecret = request.headers['x-api-secret'] as string;

    if (!apiKey || !apiSecret) {
      throw new UnauthorizedException('API key and secret required');
    }

    const business = await this.businessService.findByApiKey(apiKey);
    if (!business) throw new UnauthorizedException('Invalid API key');

    const valid = await this.businessService.validateApiSecret(business, apiSecret);
    if (!valid) throw new UnauthorizedException('Invalid API secret');

    request.business = business;
    return true;
  }
}
