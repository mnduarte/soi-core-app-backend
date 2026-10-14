import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import {
  Consent,
  ConsentDocument,
  ConsentOrigin,
  ConsentStatus,
} from './schemas/consent.schema';
import { Work, WorkDocument } from '../works/schemas/work.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import { CreateConsentDto, SignConsentDto } from './dto/consent.dto';
import { AnnulConsentDto } from './dto/annul-consent.dto';
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
    @InjectModel(Patient.name)
    private patientModel: Model<PatientDocument>,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

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
      workId = work._id;
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
    origen: ConsentOrigin = ConsentOrigin.OFFICE,
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
    consent.origin = origen;
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

  /**
   * Anula un consentimiento firmado.
   *
   * Es la contracara de `remove`: un pendiente se borra porque no documenta
   * nada, un firmado se anula porque sí. No se toca una sola letra de lo que
   * el paciente firmó —texto, firmas, fecha y hash quedan como estaban—, solo
   * se le agrega encima que dejó de valer.
   */
  async annul(
    clinicId: string,
    patientId: string,
    id: string,
    dto: AnnulConsentDto,
    requester: JwtPayload,
  ) {
    const consent = await this.findOneOrFail(clinicId, patientId, id);
    if (consent.status !== ConsentStatus.SIGNED) {
      throw new BadRequestException(
        'Un consentimiento sin firmar se borra, no se anula',
      );
    }
    if (consent.annulledAt) {
      throw new BadRequestException('Este consentimiento ya está anulado');
    }

    // La clave, antes de tocar nada. La tablet se le pasa al paciente para que
    // firme: un documento firmado no puede caerse porque alguien agarró el
    // aparato con la sesión abierta.
    const quien = await this.userModel
      .findOne({ _id: new Types.ObjectId(requester.sub), deletedAt: null })
      .exec();
    if (!quien) throw new UnauthorizedException('No se pudo verificar');
    if (!(await argon2.verify(quien.passwordHash, dto.password))) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }
    consent.annulledAt = new Date();
    consent.annulledBy = new Types.ObjectId(requester.sub);
    if (dto.reason?.trim()) consent.annulledReason = dto.reason.trim();
    consent.updatedBy = new Types.ObjectId(requester.sub);
    await consent.save();
    return consent;
  }

  /**
   * Genera el link de un solo uso para que el paciente firme desde su celular.
   *
   * Devuelve el token EN CLARO una única vez: en la base queda solo el hash,
   * así que si se pierde no se puede recuperar — se genera otro, y el anterior
   * deja de servir porque se pisa el hash.
   */
  async crearLink(clinicId: string, patientId: string, id: string) {
    const consent = await this.findOneOrFail(clinicId, patientId, id);
    if (consent.status === ConsentStatus.SIGNED) {
      throw new BadRequestException('Este consentimiento ya está firmado');
    }
    const token = randomBytes(32).toString('hex');
    consent.linkTokenHash = this.hashToken(token);
    consent.linkExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await consent.save();
    return { token, expiresAt: consent.linkExpiresAt };
  }

  /** Busca por token, validando vencimiento y que siga pendiente. */
  private async porToken(token: string) {
    const consent = await this.consentModel
      .findOne({ linkTokenHash: this.hashToken(token), deletedAt: null })
      .exec();
    // El mismo mensaje para "no existe", "venció" y "ya se firmó": distinguir
    // le serviría a alguien probando tokens, y al paciente no le cambia nada.
    const vencido =
      !consent?.linkExpiresAt || consent.linkExpiresAt < new Date();
    if (!consent || vencido || consent.status === ConsentStatus.SIGNED) {
      throw new NotFoundException('Este link ya no está disponible');
    }
    return consent;
  }

  /**
   * Lo que ve el paciente desde el link. Devuelve el MÍNIMO: el texto que va a
   * firmar, su nombre y de qué consultorio es.
   *
   * No devuelve el DNI aunque esté cargado: si lo mandáramos, cualquiera que
   * vea ese WhatsApp se entera del documento del paciente. Lo escribe él.
   */
  async verPorToken(token: string) {
    const consent = await this.porToken(token);
    const [paciente, clinica] = await Promise.all([
      this.patientModel
        .findById(consent.patientId)
        .select('name lastName')
        .exec(),
      this.consentModel.db
        .collection('clinics')
        .findOne({ _id: consent.clinicId }, { projection: { name: 1 } }),
    ]);
    return {
      templateName: consent.templateName,
      finalText: consent.finalText,
      patientName: paciente ? `${paciente.name} ${paciente.lastName}` : '',
      clinicName: (clinica?.name as string) ?? '',
    };
  }

  /** Firma desde el link. Quema el token: un link sirve una sola vez. */
  async firmarPorToken(token: string, dto: SignConsentDto) {
    const consent = await this.porToken(token);
    const firmado = await this.sign(
      String(consent.clinicId),
      String(consent.patientId),
      String(consent._id),
      dto,
      ConsentOrigin.LINK,
    );
    firmado.linkTokenHash = undefined;
    firmado.linkExpiresAt = undefined;
    await firmado.save();
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
        // Un anulado no cubre el trabajo: ese es el punto de anularlo.
        annulledAt: null,
        deletedAt: null,
      })
      .select('workId')
      .exec();
    return docs.map((d) => String(d.workId));
  }
}
