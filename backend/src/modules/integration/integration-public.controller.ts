import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { IntegrationRedirectService } from './integration-redirect.service';
import { ClaimRedirectDto } from './dto/integration-redirect.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('integration/redirect')
@Public()
export class IntegrationPublicController {
  constructor(private redirectService: IntegrationRedirectService) {}

  @Get(':token')
  getSession(@Param('token') token: string) {
    return this.redirectService.getSession(token);
  }

  @Post('claim')
  claim(@Body() dto: ClaimRedirectDto) {
    return this.redirectService.claimSession(dto.token);
  }
}
