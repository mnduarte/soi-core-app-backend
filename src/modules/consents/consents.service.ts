import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'node:crypto';
import {
  Consent,
  ConsentDocument,
  ConsentOrigin,
  ConsentStatus,
} from './schemas/consent.schema';
import { Work, WorkDocument } from '../works/schemas/work.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateConsentDto, SignConsentDto } from './dto/consent.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ConsentsService {
  constructor(
    @InjectModel(Consent.name)
    private consentModel: Model<ConsentDocument>,
    @InjectModel(Work.name)
    private workModel: Model<WorkDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  async create(
    clinicId: string,
    patientId: string,
    dto: CreateConsentDto,
    requester: JwtPayload,
  ) {
    // Si se vincula a un trabajo, el trabajo tiene que ser de esta clínica y
    // de este paciente. Nunca se confía en el id que llega del cliente.
    let workId: Types.ObjectId | undefined;
    if (dto.workId) {
      const work = await this.workModel
        .findOne({
          _id: new Types.ObjectId(dto.workId),
          clinicId: new Types.ObjectId(clinicId),
          patientId: new Types.ObjectId(patientId),
          deletedAt: null,
        })
        .exec();
      if (!work) {
        throw new NotFoundException('Trabajo no encontrado para este paciente');
      }
      workId = work._id as Types.ObjectId;
    }

    return this.consentModel.create({
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
      templateId: dto.templateId,
      templateVersionId: dto.templateVersionId,
      templateVersionN: dto.templateVersionN,
      templateName: dto.templateName,
      finalText: dto.finalText,
      dni: dto.dni,
      workId,
      status: ConsentStatus.PENDING,
      origin: ConsentOrigin.OFFICE,
      professionalId: new Types.ObjectId(requester.sub),
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  findAll(clinicId: string, patientId: string) {
    return this.consentModel
      .find({
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  private async findOneOrFail(clinicId: string, patientId: string, id: string) {
    const consent = await this.consentModel
      .findOne({
        _id: new Types.ObjectId(id),
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
        deletedAt: null,
      })
      .exec();
    if (!consent) throw new NotFoundException('Consentimiento no encontrado');
    return consent;
  }

  findOne(clinicId: string, patientId: string, id: string) {
    return this.findOneOrFail(clinicId, patientId, id);
  }

  /**
   * Firma. Es la única mutación que acepta un consentimiento, y solo una vez:
   * un documento firmado es inmutable. El hash se calcula acá y no en el
   * navegador — un hash que manda el cliente no prueba nada, porque el cliente
   * es justamente lo que no controlamos.
   */
  async sign(
    clinicId: string,
    patientId: string,
    id: string,
    dto: SignConsentDto,
  ) {
    const consent = await this.findOneOrFail(clinicId, patientId, id);

    if (consent.status === ConsentStatus.SIGNED) {
      throw new BadRequestException('Este consentimiento ya está firmado');
    }
    if (!/^data:image\/png;base64,/.test(dto.signaturePng)) {
      throw new BadRequestException('La firma tiene que ser un PNG');
    }

    const signedAt = new Date();
    const dni = dto.dni ?? consent.dni ?? '';

    // La identidad y la firma del profesional se COPIAN acá, no se leen del
    // usuario cada vez que se muestra el consentimiento: si mañana cambia su
    // matrícula o rehace su firma, lo ya firmado tiene que seguir igual.
    const prof = consent.professionalId
      ? await this.userModel
          .findOne({ _id: consent.professionalId, deletedAt: null })
          .exec()
      : null;
    if (prof) {
      consent.professionalName = prof.name;
      consent.professionalLicense = prof.clinicalProfile?.license;
      consent.professionalDni = prof.clinicalProfile?.dni;
      consent.professionalSignaturePng = prof.clinicalProfile?.signaturePng;
    }

    consent.signaturePng = dto.signaturePng;
    consent.dni = dni || undefined;
    consent.signedAt = signedAt;
    consent.status = ConsentStatus.SIGNED;
    consent.hash = createHash('sha256')
      .update(`${consent.finalText}|${dni}|${signedAt.toISOString()}`)
      .digest('hex');

    await consent.save();
    return consent;
  }

  /**
   * Borrado lógico, y solo mientras esté pendiente. Un consentimiento firmado
   * no se borra: es el respaldo de un acto que ya ocurrió, y poder hacerlo
   * desaparecer anula el sentido de haberlo firmado.
   */
  async remove(
    clinicId: string,
    patientId: string,
    id: string,
    requester: JwtPayload,
  ) {
    const consent = await this.findOneOrFail(clinicId, patientId, id);
    if (consent.status === ConsentStatus.SIGNED) {
      throw new BadRequestException(
        'No se puede borrar un consentimiento firmado',
      );
    }
    consent.deletedAt = new Date();
    consent.deletedBy = new Types.ObjectId(requester.sub);
    await consent.save();
    return { ok: true };
  }

  /** Trabajos de este paciente que ya tienen un consentimiento firmado, para
   *  el sello FIRMADO en la hoja de trabajos. */
  async signedWorkIds(clinicId: string, patientId: string) {
    const docs = await this.consentModel
      .find({
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
        status: ConsentStatus.SIGNED,
        workId: { $ne: null },
        deletedAt: null,
      })
      .select('workId')
      .exec();
    return docs.map(d => String(d.workId));
  }
}
