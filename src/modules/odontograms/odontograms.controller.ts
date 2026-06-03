import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { OdontogramsService } from './odontograms.service';
import { ApplyOpsDto } from './dto/odontogram-ops.dto';

@Controller('patients/:patientId/odontogram')
@UseGuards(JwtAuthGuard)
export class OdontogramsController {
  constructor(private readonly odontogramsService: OdontogramsService) {}

  @Get()
  findOne(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.odontogramsService.findOrCreate(clinicId, patientId);
  }

  @Patch()
  applyOps(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Body() dto: ApplyOpsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.odontogramsService.applyOps(clinicId, patientId, dto, user);
  }

  @Get('snapshots')
  getSnapshots(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.odontogramsService.getSnapshots(clinicId, patientId);
  }

  @Post('snapshots')
  saveSnapshot(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.odontogramsService.saveSnapshot(clinicId, patientId, user);
  }
}
