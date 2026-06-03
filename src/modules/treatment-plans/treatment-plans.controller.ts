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
import { TreatmentPlansService } from './treatment-plans.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import {
  AddTreatmentItemDto,
  UpdateTreatmentItemDto,
  UpdateTreatmentPlanDto,
} from './dto/update-treatment-plan.dto';

@Controller('patients/:patientId/treatment-plans')
@UseGuards(JwtAuthGuard)
export class TreatmentPlansController {
  constructor(private readonly treatmentPlansService: TreatmentPlansService) {}

  @Post()
  create(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Body() dto: CreateTreatmentPlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.treatmentPlansService.create(clinicId, patientId, dto, user);
  }

  @Get()
  findAll(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.treatmentPlansService.findAll(clinicId, patientId);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.treatmentPlansService.findById(clinicId, id);
  }

  @Patch(':id')
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTreatmentPlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.treatmentPlansService.update(clinicId, id, dto, user);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateTreatmentItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.treatmentPlansService.updateItem(clinicId, id, itemId, dto, user);
  }

  // Append-style endpoint: the controller is mounted under
  // /patients/:patientId/treatment-plans, so this path adds the item to that
  // patient's plan (creating one if it doesn't exist).
  @Post('items')
  addItem(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Body() dto: AddTreatmentItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.treatmentPlansService.addItem(clinicId, patientId, dto, user);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.treatmentPlansService.removeItem(clinicId, id, itemId, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.treatmentPlansService.softDelete(clinicId, id, user);
  }
}
