import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clinic, ClinicDocument, SubscriptionStatus } from '../clinics/schemas/clinic.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Banner, BannerDocument } from '../banners/schemas/banner.schema';
import { UpdateClinicSubscriptionDto, CreateBannerDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Clinic.name) private clinicModel: Model<ClinicDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Banner.name) private bannerModel: Model<BannerDocument>,
  ) {}

  async findAllClinics(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [clinics, total] = await Promise.all([
      this.clinicModel.find({ deletedAt: null }).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.clinicModel.countDocuments({ deletedAt: null }),
    ]);
    return { clinics, total, page, limit };
  }

  async findClinicById(clinicId: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    return clinic;
  }

  async updateClinicSubscription(clinicId: string, dto: UpdateClinicSubscriptionDto) {
    const clinic = await this.findClinicById(clinicId);
    if (dto.status) clinic.status = dto.status as any;
    if (dto.subscriptionEndsAt) clinic.subscriptionEndsAt = new Date(dto.subscriptionEndsAt);
    return clinic.save();
  }

  async getMetrics() {
    const [totalClinics, activeClinics, trialClinics, suspendedClinics, totalUsers] = await Promise.all([
      this.clinicModel.countDocuments({ deletedAt: null }),
      this.clinicModel.countDocuments({ deletedAt: null, status: SubscriptionStatus.ACTIVE }),
      this.clinicModel.countDocuments({ deletedAt: null, status: SubscriptionStatus.TRIAL }),
      this.clinicModel.countDocuments({ deletedAt: null, status: SubscriptionStatus.SUSPENDED }),
      this.userModel.countDocuments({ deletedAt: null }),
    ]);
    return { totalClinics, activeClinics, trialClinics, suspendedClinics, totalUsers };
  }

  async createBanner(dto: CreateBannerDto) {
    return this.bannerModel.create({
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      isActive: dto.isActive ?? true,
    });
  }

  async deleteBanner(bannerId: string) {
    const banner = await this.bannerModel.findById(bannerId).exec();
    if (!banner) throw new NotFoundException('Banner no encontrado');
    await banner.deleteOne();
    return { deleted: true };
  }

  async findAllBanners() {
    return this.bannerModel.find().sort({ createdAt: -1 }).exec();
  }
}
