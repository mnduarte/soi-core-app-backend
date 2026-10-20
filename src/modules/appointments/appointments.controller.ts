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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './dto/create-appointment.dto';
import { InterpretAgendaDto } from './dto/interpret-agenda.dto';
import { AgendaIntentService } from './agenda-intent.service';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly agendaIntent: AgendaIntentService,
  ) {}

  /**
   * Entiende una frase suelta y devuelve lo que haría, sin hacerlo.
   *
   * Siempre POST aunque no escriba nada: la frase va en el cuerpo y no en la
   * URL porque lleva el nombre del paciente, y eso no tiene por qué quedar en
   * los logs de acceso ni en el historial del navegador.
   *
   * Limitado: cada llamada cuesta plata de verdad, así que alguien con la
   * sesión abierta no puede dispararlas en bucle.
   */
  @Post('interpret')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  interpret(@ClinicId() clinicId: string, @Body() dto: InterpretAgendaDto) {
    return this.agendaIntent.interpretar(clinicId, dto.texto);
  }

  @Post()
  create(
    @ClinicId() clinicId: string,
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.appointmentsService.create(clinicId, dto, user);
  }

  @Get()
  findAll(
    @ClinicId() clinicId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.appointmentsService.findAll(clinicId, from, to, patientId);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.appointmentsService.findById(clinicId, id);
  }

  @Patch(':id')
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.appointmentsService.update(clinicId, id, dto, user);
  }

  @Patch(':id/reminder-sent')
  markReminderSent(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.appointmentsService.markReminderSent(clinicId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.appointmentsService.softDelete(clinicId, id, user);
  }

  // Borrado físico del turno (la libreta lo usa para corregir errores de carga).
  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  hardRemove(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.appointmentsService.hardDelete(clinicId, id);
  }
}
