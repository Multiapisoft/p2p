import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { BusinessApiRequest } from '../../common/guards/api-key.guard';

export const CurrentBusiness = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<BusinessApiRequest>();
    return request.business;
  },
);
