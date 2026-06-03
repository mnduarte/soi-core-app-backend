import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Invitation, InvitationDocument } from './schemas/invitation.schema';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { addDays } from 'date-fns';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectModel(Invitation.name)
    private invitationModel: Model<InvitationDocument>,
    private config: ConfigService,
  ) {}

  async create(clinicId: string, dto: CreateInvitationDto, requester: JwtPayload) {
    // Check for pending invitation for same email
    const existing = await this.invitationModel
      .findOne({
        clinicId: new Types.ObjectId(clinicId),
        email: dto.email.toLowerCase(),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .exec();

    if (existing) {
      throw new ConflictException('Ya existe una invitación pendiente para ese email');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresInDays =
      parseInt(this.config.get('INVITATION_TOKEN_EXPIRES_DAYS', '7')) || 7;

    const invitation = await this.invitationModel.create({
      clinicId: new Types.ObjectId(clinicId),
      email: dto.email.toLowerCase(),
      role: dto.role,
      isClinical: dto.isClinical ?? false,
      token,
      expiresAt: addDays(new Date(), expiresInDays),
      createdBy: new Types.ObjectId(requester.sub),
    });

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');
    return {
      ...invitation.toObject(),
      inviteLink: `${frontendUrl}/accept-invitation?token=${token}`,
    };
  }

  async findAll(clinicId: string) {
    return this.invitationModel
      .find({ clinicId: new Types.ObjectId(clinicId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async revoke(clinicId: string, id: string, requester: JwtPayload) {
    const invitation = await this.invitationModel
      .findOne({
        _id: new Types.ObjectId(id),
        clinicId: new Types.ObjectId(clinicId),
        acceptedAt: null,
        revokedAt: null,
      })
      .exec();

    if (!invitation) throw new NotFoundException('Invitación no encontrada');

    invitation.revokedAt = new Date();
    return invitation.save();
  }
}
