import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GalleryService } from './gallery.service';
import { GalleryController } from './gallery.controller';
import { GallerySession, GallerySessionSchema } from './schemas/gallery-session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: GallerySession.name, schema: GallerySessionSchema }]),
  ],
  controllers: [GalleryController],
  providers: [GalleryService],
  exports: [GalleryService],
})
export class GalleryModule {}
