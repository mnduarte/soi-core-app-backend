import { Module } from '@nestjs/common';
import { ChangesController } from './changes.controller';
import { ChangesService } from './changes.service';

// No usa forFeature: lee las colecciones crudas vía la conexión de Mongoose
// (@InjectConnection en el service), así no acopla con los schemas de cada
// feature ni pasa por los hooks de soft-delete.
@Module({
  controllers: [ChangesController],
  providers: [ChangesService],
})
export class ChangesModule {}
