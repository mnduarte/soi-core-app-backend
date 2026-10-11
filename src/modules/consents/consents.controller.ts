import {
  Body,
  Controller,
  Delete,
  Get,
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

  @Post(':id/sign')
  sign(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
    @Body() dto: SignConsentDto,
  ) {
    return this.consentsService.sign(clinicId, patientId, id, dto);
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
