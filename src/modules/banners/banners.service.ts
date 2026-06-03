import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Banner, BannerDocument } from './schemas/banner.schema';
import { BannerDismissal, BannerDismissalDocument } from './schemas/banner-dismissal.schema';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class BannersService {
  constructor(
    @InjectModel(Banner.name) private bannerModel: Model<BannerDocument>,
    @InjectModel(BannerDismissal.name) private dismissalModel: Model<BannerDismissalDocument>,
  ) {}

  async findActive(user: JwtPayload) {
    const now = new Date();

    const banners = await this.bannerModel
      .find({
        isActive: true,
        $and: [
          { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();

    const dismissals = await this.dismissalModel
      .find({ userId: new Types.ObjectId(user.sub) })
      .select('bannerId')
      .exec();

    const dismissedIds = new Set(dismissals.map(d => d.bannerId.toString()));

    return banners.filter(b => !dismissedIds.has(b._id.toString()));
  }

  async dismiss(bannerId: string, user: JwtPayload) {
    const banner = await this.bannerModel.findById(bannerId).exec();
    if (!banner) throw new NotFoundException('Banner no encontrado');

    await this.dismissalModel.findOneAndUpdate(
      { bannerId: new Types.ObjectId(bannerId), userId: new Types.ObjectId(user.sub) },
      { bannerId: new Types.ObjectId(bannerId), userId: new Types.ObjectId(user.sub), dismissedAt: new Date() },
      { upsert: true },
    );

    return { dismissed: true };
  }
}
