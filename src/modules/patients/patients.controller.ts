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
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { ScanFichaDto } from './dto/scan-ficha.dto';

@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  // Read a paper record photo → extracted fields + possible existing match.
  @Post('scan')
  scanFicha(@ClinicId() clinicId: string, @Body() dto: ScanFichaDto) {
    return this.patientsService.scanFicha(clinicId, dto);
  }

  @Post()
  create(
    @ClinicId() clinicId: string,
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.create(clinicId, dto, user);
  }

  @Get()
  findAll(
    @ClinicId() clinicId: string,
    @Query('search') search?: string,
  ) {
    return this.patientsService.findAll(clinicId, search);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.patientsService.findById(clinicId, id);
  }

  @Patch(':id')
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.update(clinicId, id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.patientsService.softDelete(clinicId, id, user);
  }
}
