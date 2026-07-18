import { Controller, Get, Query } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { TransactionListQueryDto } from './dto/transaction.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';

@Controller('transactions')
export class TransactionController {
  constructor(private transactionService: TransactionService) {}

  @Get()
  getMyTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TransactionListQueryDto,
  ) {
    return this.transactionService.findByUser(user.userId, query);
  }

  @Get('admin/all')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  getAllTransactions(@Query() query: TransactionListQueryDto) {
    return this.transactionService.findAll(query);
  }
}
