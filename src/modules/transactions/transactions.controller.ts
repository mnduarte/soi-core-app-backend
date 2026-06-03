import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/transaction.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(
    @ClinicId() clinicId: string,
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionsService.create(clinicId, dto, user);
  }

  @Get()
  findAll(@ClinicId() clinicId: string, @Query('patientId') patientId?: string) {
    return this.transactionsService.findAll(clinicId, patientId);
  }

  @Get('balance/:patientId')
  getBalance(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.transactionsService.getBalance(clinicId, patientId);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  void(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionsService.void(clinicId, id, user);
  }
}
