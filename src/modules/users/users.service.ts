import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async findAll(clinicId: string, isClinical?: boolean) {
    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
      deletedAt: null,
    };
    if (isClinical !== undefined) filter.isClinical = isClinical;
    return this.userModel.find(filter).select('-passwordHash').exec();
  }

  async findById(clinicId: string, userId: string) {
    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(userId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async update(clinicId: string, userId: string, dto: UpdateUserDto, requester: JwtPayload) {
    const user = await this.findById(clinicId, userId);

    // Only OWNER can change roles
    if (dto.role !== undefined && requester.role !== UserRole.OWNER) {
      throw new ForbiddenException('Solo el propietario puede cambiar roles');
    }

    Object.assign(user, dto);
    user.updatedAt = new Date();
    user.updatedBy = new Types.ObjectId(requester.sub);
    return user.save();
  }

  async softDelete(clinicId: string, userId: string, requester: JwtPayload) {
    if (requester.sub === userId) {
      throw new ForbiddenException('No podés eliminar tu propia cuenta');
    }
    const user = await this.findById(clinicId, userId);
    user.deletedAt = new Date();
    user.deletedBy = new Types.ObjectId(requester.sub);
    return user.save();
  }
}
