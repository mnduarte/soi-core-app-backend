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
import { ClinicalGuard, veClinico } from '../../common/guards/clinical.guard';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { ScanFichaDto } from './dto/scan-ficha.dto';
import { QuickCreatePatientDto } from './dto/quick-create-patient.dto';

/**
 * Lo que el Asistente NO recibe de un paciente: el saldo (cuánto debe) y los
 * antecedentes médicos. El resto —nombre, contacto, obra social— es lo que
 * necesita para agendar y lo ve igual que todos.
 *
 * Se recorta en la salida y no con un `select` en la consulta porque el mismo
 * servicio lo usan el titular y los profesionales, que sí lo ven completo.
 */
function paraRecepcion(patient: unknown): Record<string, unknown> {
  const plano =
    patient &&
    typeof (patient as { toObject?: unknown }).toObject === 'function'
      ? (patient as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(patient as Record<string, unknown>) };
  delete plano.balance;
  delete plano.medicalHistory;
  return plano;
}

@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  // Crear paciente rápido desde agenda (solo nombre, se splitea automáticamente).
  @Post('quick-create')
  @HttpCode(HttpStatus.CREATED)
  quickCreate(
    @ClinicId() clinicId: string,
    @Body() dto: QuickCreatePatientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.quickCreate(clinicId, dto, user);
  }

  // Read a paper record photo → extracted fields + possible existing match.
  @Post('scan')
  @UseGuards(ClinicalGuard)
  scanFicha(@ClinicId() clinicId: string, @Body() dto: ScanFichaDto) {
    return this.patientsService.scanFicha(clinicId, dto);
  }

  @Post()
  async create(
    @ClinicId() clinicId: string,
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (veClinico(user))
      return this.patientsService.create(clinicId, dto, user);
    // El Asistente no carga antecedentes médicos: si vinieran, se ignoran.
    delete dto.medicalHistory;
    return paraRecepcion(
      await this.patientsService.create(clinicId, dto, user),
    );
  }

  @Get()
  async findAll(
    @ClinicId() clinicId: string,
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
  ) {
    const patients = await this.patientsService.findAll(clinicId, search);
    return veClinico(user) ? patients : patients.map(paraRecepcion);
  }

  @Get(':id')
  async findOne(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const patient = await this.patientsService.findById(clinicId, id);
    return veClinico(user) ? patient : paraRecepcion(patient);
  }

  @Patch(':id')
  async update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (veClinico(user))
      return this.patientsService.update(clinicId, id, dto, user);
    // Se BORRA la clave, no alcanza con ignorarla: el servicio hace
    // Object.assign con el DTO, y una clave presente aunque sea `undefined`
    // pisaría los antecedentes que cargó el profesional.
    delete dto.medicalHistory;
    return paraRecepcion(
      await this.patientsService.update(clinicId, id, dto, user),
    );
  }

  // Borrar un paciente se lleva su ficha entera: no es una tarea de recepción.
  @Delete(':id')
  @UseGuards(ClinicalGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.softDelete(clinicId, id, user);
  }

  // Revive a soft-deleted patient (with all its history).
  @Post(':id/restore')
  @UseGuards(ClinicalGuard)
  restore(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.patientsService.restore(clinicId, id);
  }

  // Borrado físico + cascade (limpiar duplicados). Irreversible.
  @Delete(':id/hard')
  @UseGuards(ClinicalGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  hardRemove(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.patientsService.hardDelete(clinicId, id);
  }
}
