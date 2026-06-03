import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OdontogramsService } from './odontograms.service';
import { OdontogramsController } from './odontograms.controller';
import { Odontogram, OdontogramSchema } from './schemas/odontogram.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Odontogram.name, schema: OdontogramSchema }]),
  ],
  controllers: [OdontogramsController],
  providers: [OdontogramsService],
  exports: [OdontogramsService],
})
export class OdontogramsModule {}
