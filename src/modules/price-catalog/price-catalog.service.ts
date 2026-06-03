import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PriceCatalogItem, PriceCatalogItemDocument } from './schemas/price-catalog-item.schema';
import { CreatePriceCatalogItemDto } from './dto/create-price-catalog-item.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class PriceCatalogService {
  constructor(
    @InjectModel(PriceCatalogItem.name) private itemModel: Model<PriceCatalogItemDocument>,
  ) {}

  async create(clinicId: string, dto: CreatePriceCatalogItemDto, requester: JwtPayload) {
    return this.itemModel.create({
      ...dto,
      clinicId: new Types.ObjectId(clinicId),
      isActive: dto.isActive ?? true,
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  async findAll(clinicId: string, category?: string) {
    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
      deletedAt: null,
    };
    if (category) filter.category = category;
    return this.itemModel.find(filter).sort({ category: 1, name: 1 }).exec();
  }

  async findById(clinicId: string, itemId: string) {
    const item = await this.itemModel
      .findOne({
        _id: new Types.ObjectId(itemId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!item) throw new NotFoundException('Item no encontrado en el catálogo');
    return item;
  }

  async update(clinicId: string, itemId: string, dto: Partial<CreatePriceCatalogItemDto>, requester: JwtPayload) {
    const item = await this.findById(clinicId, itemId);
    Object.assign(item, dto);
    item.updatedAt = new Date();
    item.updatedBy = new Types.ObjectId(requester.sub);
    return item.save();
  }

  async softDelete(clinicId: string, itemId: string, requester: JwtPayload) {
    const item = await this.findById(clinicId, itemId);
    item.deletedAt = new Date();
    item.deletedBy = new Types.ObjectId(requester.sub);
    return item.save();
  }
}
