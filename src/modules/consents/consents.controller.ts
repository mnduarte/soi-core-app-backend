import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClinicalGuard } from '../../common/guards/clinical.guard';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { ConsentsService } from './consents.service';
import { CreateConsentDto, SignConsentDto } from './dto/consent.dto';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AnnulConsentDto } from './dto/annul-consent.dto';

@Controller('patients/:patientId/consents')
// Consentimiento informado es documentación clínica: el Asistente no entra.
@UseGuards(JwtAuthGuard, ClinicalGuard)
export class ConsentsController {
  constructor(private readonly consentsService: ConsentsService) {}

  @Post()
  create(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Body() dto: CreateConsentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.consentsService.create(clinicId, patientId, dto, user);
  }

  @Get()
  findAll(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.consentsService.findAll(clinicId, patientId);
  }

  @Get('signed-works')
  signedWorks(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.consentsService.signedWorkIds(clinicId, patientId);
  }

  @Get(':id')
  findOne(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
  ) {
    return this.consentsService.findOne(clinicId, patientId, id);
  }

  // Genera el link de un solo uso. Devuelve el token en claro UNA vez: en la
  // base queda solo su hash.
  @Post(':id/link')
  @HttpCode(HttpStatus.OK)
  crearLink(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
  ) {
    return this.consentsService.crearLink(clinicId, patientId, id);
  }

  @Post(':id/sign')
  sign(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
    @Body() dto: SignConsentDto,
  ) {
    return this.consentsService.sign(clinicId, patientId, id, dto);
  }

  /**
   * Baja de un firmado. El pendiente se borra con DELETE; este se anula.
   *
   * Pide la contraseña, así que va limitado: si no, alguien con la tablet
   * desatendida podría probar claves de a una contra este endpoint.
   */
  @Post(':id/annul')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  annul(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
    @Body() dto: AnnulConsentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.consentsService.annul(clinicId, patientId, id, dto, user);
  }

  @Delete(':id')
  remove(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.consentsService.remove(clinicId, patientId, id, user);
  }
}
