import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { ClinicsService } from './clinics.service';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('clinics')
@UseGuards(JwtAuthGuard)
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Get('me')
  getMe(@ClinicId() clinicId: string) {
    return this.clinicsService.findById(clinicId);
  }

  @Patch('me')
  updateMe(@ClinicId() clinicId: string, @Body() dto: UpdateClinicDto) {
    return this.clinicsService.updateClinic(clinicId, dto);
  }

  @Get('me/settings')
  getSettings(@ClinicId() clinicId: string) {
    return this.clinicsService.getSettings(clinicId);
  }

  @Patch('me/settings')
  updateSettings(@ClinicId() clinicId: string, @Body() dto: UpdateSettingsDto) {
    return this.clinicsService.updateSettings(clinicId, dto);
  }
}
