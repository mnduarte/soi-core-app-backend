import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateTourDto } from './dto/update-tour.dto';
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

  /**
   * Guarda el avance de las ayudas de primera vez.
   *
   * **Suma, no reemplaza.** La misma persona puede tener la app abierta en la
   * tablet y en la computadora; si cada una pisara el estado de la otra, las
   * ayudas cerradas en una volverían a salir en la otra. Unir listas es
   * monótono: nada de lo ya visto se pierde por una carrera entre dispositivos.
   * Para volver atrás está `resetTour`, que es un pedido explícito.
   *
   * Los contadores se quedan con el MAYOR por la misma razón: son "cuántos
   * turnos anotó", y el número más alto es el que vio más historia.
   */
  async updateTour(clinicId: string, userId: string, dto: UpdateTourDto) {
    const user = await this.findById(clinicId, userId);
    const actual = user.tour ?? { vistas: [], contadores: {} };

    const vistas = dto.vistas
      ? [...new Set([...(actual.vistas ?? []), ...dto.vistas])]
      : (actual.vistas ?? []);

    const contadores = { ...(actual.contadores ?? {}) };
    if (dto.contadores) {
      for (const [clave, valor] of Object.entries(dto.contadores)) {
        // Saneo acá y no en el DTO: class-validator no mira adentro de un
        // objeto libre. Clave con forma de clave, valor entero y acotado.
        if (!/^[a-z0-9-]{1,40}$/.test(clave)) continue;
        if (typeof valor !== 'number' || !Number.isFinite(valor)) continue;
        const n = Math.min(Math.max(Math.trunc(valor), 0), 100000);
        contadores[clave] = Math.max(contadores[clave] ?? 0, n);
      }
    }

    user.tour = { vistas, contadores };
    user.updatedBy = new Types.ObjectId(userId);
    await user.save();
    return user.tour;
  }

  /** "Volver a ver las ayudas": borra las banderas Y los contadores. Sin los
   *  contadores no alcanza — hay ayudas que salen al segundo turno o al
   *  segundo trabajo, y con la cuenta vieja esas no volverían a aparecer. */
  async resetTour(clinicId: string, userId: string) {
    const user = await this.findById(clinicId, userId);
    user.tour = { vistas: [], contadores: {} };
    user.updatedBy = new Types.ObjectId(userId);
    await user.save();
    return user.tour;
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
      // Campo por campo, nunca `...cp`: con `transform: true` el DTO llega
      // como instancia con TODAS las opcionales presentes en `undefined`, y el
      // spread pisaría con `undefined` lo que ya estaba guardado.
      user.clinicalProfile = {
        ...actual,
        ...(cp.license !== undefined && { license: cp.license }),
        ...(cp.dni !== undefined && { dni: cp.dni }),
        ...(cp.signaturePng !== undefined && { signaturePng: cp.signaturePng }),
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
