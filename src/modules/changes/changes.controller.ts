import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { ChangesService } from './changes.service';

// GET /changes → mapa { recurso: updatedAtMs } de la clínica del JWT.
// Endpoint deliberadamente barato: lo pollean los frontends cada ~12s para
// detectar cambios hechos en otro dispositivo (Opción 2, heartbeat).
@Controller('changes')
@UseGuards(JwtAuthGuard)
export class ChangesController {
  constructor(private readonly changesService: ChangesService) {}

  @Get()
  getChanges(@ClinicId() clinicId: string): Promise<Record<string, number>> {
    return this.changesService.getChanges(clinicId);
  }
}
