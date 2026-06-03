import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PriceCatalogService } from './price-catalog.service';
import { PriceCatalogController } from './price-catalog.controller';
import { PriceCatalogItem, PriceCatalogItemSchema } from './schemas/price-catalog-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PriceCatalogItem.name, schema: PriceCatalogItemSchema }]),
  ],
  controllers: [PriceCatalogController],
  providers: [PriceCatalogService],
  exports: [PriceCatalogService],
})
export class PriceCatalogModule {}
