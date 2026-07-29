import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { WorksService } from './works.service';
import { CreateWorkDto, UpdateWorkDto } from './dto/work.dto';

@Controller('works')
@UseGuards(JwtAuthGuard)
export class WorksController {
  constructor(private readonly worksService: WorksService) {}

  @Post()
  create(
    @ClinicId() clinicId: string,
    @Body() dto: CreateWorkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.worksService.create(clinicId, dto, user);
  }

  @Get()
  findAll(
    @ClinicId() clinicId: string,
    @Query('patientId') patientId: string,
    // status: 'pending' (plan) | 'done' (historial) | estado puntual;
    // q: texto/monto; limit: paginación server-side; from/to: rango de fecha.
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.worksService.findAll(clinicId, patientId, {
      status,
      q,
      limit: limit ? Number(limit) : undefined,
      from,
      to,
    });
  }

  @Get('summary/:patientId')
  summary(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.worksService.summary(clinicId, patientId);
  }

  @Patch(':id')
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.worksService.update(clinicId, id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.worksService.softDelete(clinicId, id, user);
  }
}
