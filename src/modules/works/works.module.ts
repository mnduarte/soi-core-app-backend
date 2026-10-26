import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorksService } from './works.service';
import { WorksController } from './works.controller';
import { Work, WorkSchema } from './schemas/work.schema';
import { PlanDictadoService } from './plan-dictado.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Work.name, schema: WorkSchema }]),
  ],
  controllers: [WorksController],
  providers: [WorksService, PlanDictadoService],
  exports: [WorksService],
})
export class WorksModule {}
