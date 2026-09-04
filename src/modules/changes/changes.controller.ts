import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ChangesService, type ChangesResponse } from './changes.service';

// GET /changes → { resources: { recurso: updatedAtMs }, subscription }.
// Endpoint deliberadamente barato: lo pollean los frontends cada ~12s para
// detectar cambios hechos en otro dispositivo (Opción 2, heartbeat).
@Controller('changes')
@UseGuards(JwtAuthGuard)
export class ChangesController {
  constructor(private readonly changesService: ChangesService) {}

  @Get()
  getChanges(
    @ClinicId() clinicId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChangesResponse> {
    // `user.imp` = sesión de soporte. No marca presencia: si no, entrar a
    // mirar una cuenta desde el backoffice la dejaría figurando "en línea",
    // que es justo lo contrario de lo que el dato tiene que decir.
    return this.changesService.getChanges(clinicId, user?.imp === true);
  }
}
