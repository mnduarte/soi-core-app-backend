import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { DayNotesService } from './day-notes.service';
import { SaveDayNoteDto } from './dto/save-day-note.dto';

@Controller('day-notes')
@UseGuards(JwtAuthGuard)
export class DayNotesController {
  constructor(private readonly dayNotesService: DayNotesService) {}

  @Get()
  get(@ClinicId() clinicId: string, @Query('date') date?: string) {
    return this.dayNotesService.get(clinicId, date);
  }

  @Put()
  save(
    @ClinicId() clinicId: string,
    @Body() dto: SaveDayNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.dayNotesService.save(clinicId, dto, user);
  }
}
