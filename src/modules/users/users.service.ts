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
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

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

  async update(
    clinicId: string,
    userId: string,
    dto: UpdateUserDto,
    requester: JwtPayload,
  ) {
    const esTitular = (requester.role as UserRole) === UserRole.OWNER;

    // Un miembro solo se edita a sí mismo. Antes podía editar a cualquiera del
    // consultorio, titular incluido.
    if (!esTitular && requester.sub !== userId) {
      throw new ForbiddenException(
        'Solo el titular puede editar a otros usuarios',
      );
    }
    // Y no puede tocar lo que define qué ve. `isClinical` es la llave de la
    // ficha clínica (ver ClinicalGuard): si un Asistente pudiera ponérsela en
    // true, la restricción entera sería decorativa.
    if (
      !esTitular &&
      (dto.role !== undefined || dto.isClinical !== undefined)
    ) {
      throw new ForbiddenException(
        'Solo el titular puede cambiar el tipo de usuario',
      );
    }

    const user = await this.findById(clinicId, userId);

    // Campo por campo, nunca Object.assign con el DTO: con transform:true las
    // opcionales llegan como `undefined` y pisan lo guardado (ver CLAUDE.md).
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isClinical !== undefined) user.isClinical = dto.isClinical;
    if (dto.clinicalProfile !== undefined) {
      const actual = user.clinicalProfile ?? {};
      const cp = dto.clinicalProfile;
      user.clinicalProfile = {
        ...actual,
        ...(cp.license !== undefined && { license: cp.license }),
        ...(cp.specialty !== undefined && { specialty: cp.specialty }),
        ...(cp.agendaColor !== undefined && { agendaColor: cp.agendaColor }),
      };
    }
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
