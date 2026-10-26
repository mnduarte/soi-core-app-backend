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
import { ClinicalGuard } from '../../common/guards/clinical.guard';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { WorksService } from './works.service';
import { CreateWorkDto, UpdateWorkDto } from './dto/work.dto';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { DictarPlanDto } from './dto/dictar-plan.dto';
import { ScanPlanDto } from './dto/scan-plan.dto';
import { PlanDictadoService } from './plan-dictado.service';

@Controller('works')
// Todo lo de este controller es clínico: el Asistente no entra (ver ClinicalGuard).
@UseGuards(JwtAuthGuard, ClinicalGuard)
export class WorksController {
  constructor(
    private readonly worksService: WorksService,
    private readonly dictado: PlanDictadoService,
  ) {}

  /**
   * Interpreta un plan dictado. NO crea nada: devuelve la propuesta para que
   * el odontólogo la revise y confirme. Un precio mal escuchado que entrara
   * solo a la ficha sería plata mal contada sin que nadie lo haya visto.
   */
  @Post('dictar')
  @HttpCode(HttpStatus.OK)
  // Cada llamada cuesta plata de verdad: mismo tope que el dictado de paciente.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  dictar(@Body() dto: DictarPlanDto) {
    return this.dictado.interpretar(dto.texto);
  }

  /**
   * Lo mismo leyendo la columna "PLAN DE TRATAMIENTO" de la ficha de papel.
   * Tampoco crea nada: devuelve la propuesta para revisar.
   */
  @Post('scan-plan')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  scanPlan(@Body() dto: ScanPlanDto) {
    return this.dictado.desdeFoto(dto.image, dto.mediaType);
  }

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
