import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { ClinicalEntriesService } from './clinical-entries.service';
import { CreateClinicalEntryDto } from './dto/create-clinical-entry.dto';
import { IsString } from 'class-validator';

class UpdateContentDto {
  @IsString()
  content: string;
}

@Controller('patients/:patientId/clinical-entries')
@UseGuards(JwtAuthGuard)
export class ClinicalEntriesController {
  constructor(private readonly clinicalEntriesService: ClinicalEntriesService) {}

  @Post()
  create(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Body() dto: CreateClinicalEntryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinicalEntriesService.create(clinicId, patientId, dto, user);
  }

  @Get()
  findAll(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.clinicalEntriesService.findAll(clinicId, patientId);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.clinicalEntriesService.findById(clinicId, id);
  }

  @Patch(':id')
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinicalEntriesService.update(clinicId, id, dto.content, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinicalEntriesService.softDelete(clinicId, id, user);
  }
}
