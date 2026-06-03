import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TreatmentPlansService } from './treatment-plans.service';
import { TreatmentPlansController } from './treatment-plans.controller';
import { TreatmentPlan, TreatmentPlanSchema } from './schemas/treatment-plan.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TreatmentPlan.name, schema: TreatmentPlanSchema }]),
  ],
  controllers: [TreatmentPlansController],
  providers: [TreatmentPlansService],
  exports: [TreatmentPlansService],
})
export class TreatmentPlansModule {}
