import { Controller, Get, Query } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { TransactionListQueryDto } from './dto/transaction.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { BusinessService } from '../business/business.service';

@Controller('transactions')
export class TransactionController {
  constructor(
    private transactionService: TransactionService,
    private businessService: BusinessService,
  ) {}

  @Get()
  getMyTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TransactionListQueryDto,
  ) {
    return this.transactionService.findByUser(user.userId, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      sort: query.sort,
      type: query.type,
      direction: query.direction,
    });
  }

  @Get('business')
  @Roles(UserRole.BUSINESS)
  async getBusinessTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TransactionListQueryDto,
  ) {
    const business = await this.businessService.findForActor(user.userId);
    return this.transactionService.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      sort: query.sort,
      type: query.type,
      direction: query.direction,
      businessId: business._id.toString(),
    });
  }

  @Get('admin/all')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  getAllTransactions(@Query() query: TransactionListQueryDto) {
    return this.transactionService.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      sort: query.sort,
      type: query.type,
      userId: query.userId,
      direction: query.direction,
    });
  }
}
