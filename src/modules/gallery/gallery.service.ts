import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GallerySession, GallerySessionDocument } from './schemas/gallery-session.schema';
import { CreateGallerySessionDto, AddPhotoDto } from './dto/gallery.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class GalleryService {
  constructor(
    @InjectModel(GallerySession.name) private sessionModel: Model<GallerySessionDocument>,
    private config: ConfigService,
  ) {}

  async createSession(clinicId: string, patientId: string, dto: CreateGallerySessionDto, requester: JwtPayload) {
    return this.sessionModel.create({
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
      title: dto.title,
      notes: dto.notes,
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  async findSessions(clinicId: string, patientId: string) {
    return this.sessionModel
      .find({
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findSession(clinicId: string, sessionId: string) {
    const session = await this.sessionModel
      .findOne({
        _id: new Types.ObjectId(sessionId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!session) throw new NotFoundException('Sesión de galería no encontrada');
    return session;
  }

  async addPhoto(clinicId: string, sessionId: string, dto: AddPhotoDto, requester: JwtPayload) {
    const session = await this.findSession(clinicId, sessionId);
    session.photos.push({
      _id: new Types.ObjectId(),
      publicId: dto.publicId,
      url: dto.url,
      thumbnailUrl: dto.thumbnailUrl,
      caption: dto.caption,
      toothNumber: dto.toothNumber,
      uploadedAt: new Date(),
      uploadedBy: new Types.ObjectId(requester.sub),
    });
    session.markModified('photos');
    return session.save();
  }

  async removePhoto(clinicId: string, sessionId: string, photoId: string, requester: JwtPayload) {
    const session = await this.findSession(clinicId, sessionId);
    const photoIndex = session.photos.findIndex(p => p._id.toString() === photoId);
    if (photoIndex < 0) throw new NotFoundException('Foto no encontrada');
    session.photos.splice(photoIndex, 1);
    session.updatedBy = new Types.ObjectId(requester.sub);
    session.markModified('photos');
    return session.save();
  }

  getSignedUploadParams(clinicId: string) {
    const cloudName = this.config.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get('CLOUDINARY_API_SECRET');
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `soi/${clinicId}`;

    const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha256').update(toSign).digest('hex');

    return { cloudName, apiKey, timestamp, folder, signature };
  }

  async softDeleteSession(clinicId: string, sessionId: string, requester: JwtPayload) {
    const session = await this.findSession(clinicId, sessionId);
    session.deletedAt = new Date();
    session.deletedBy = new Types.ObjectId(requester.sub);
    return session.save();
  }
}
