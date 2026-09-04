import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Observable } from 'rxjs';
import {
  Clinic,
  ClinicDocument,
} from '../../modules/clinics/schemas/clinic.schema';
import { isReadonly } from '../subscription.policy';
import { JwtPayload } from '../decorators/current-user.decorator';

const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

/**
 * Corta las escrituras de un consultorio en mora.
 *
 * **Por qué un interceptor y no un guard.** Existía un `ReadonlyGuard` que no
 * estaba aplicado en ningún lado. Registrarlo como guard global tampoco sirve:
 * en NestJS los guards globales corren ANTES que los de controller, así que se
 * ejecutaría antes del `JwtAuthGuard` y `request.user` todavía sería
 * `undefined` — dejando pasar todo. Los interceptores, en cambio, corren
 * DESPUÉS de los guards, con el usuario ya resuelto.
 *
 * Dos decisiones que importan:
 *
 * 1. **Se evalúa en cada escritura, no al iniciar sesión.** El flag viejo se
 *    calculaba una vez en el login y viajaba al front. Con eso, alguien con la
 *    sesión abierta seguía escribiendo para siempre; y al revés, registrar el
 *    pago no le devolvía el acceso hasta que cerrara sesión. Es una lectura por
 *    escritura de un documento chico buscado por `_id`.
 *
 * 2. **Solo en métodos que escriben.** Consultar la ficha del paciente que está
 *    en el sillón tiene que seguir funcionando: esa es toda la diferencia entre
 *    "solo lectura" y "bloqueado".
 */
@Injectable()
export class ReadonlyInterceptor implements NestInterceptor {
  constructor(
    @InjectModel(Clinic.name) private clinicModel: Model<ClinicDocument>,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      path?: string;
      url?: string;
      user?: JwtPayload;
    }>();

    if (!MUTATING_METHODS.includes(request.method)) return next.handle();

    // Sin JWT de clínica no hay nada que evaluar: puede ser una ruta pública
    // (login, webhook de Mercado Pago) o del backoffice, que tiene su propio
    // guard y NO debe quedar bloqueado por la mora del consultorio que edita —
    // bloquearlo sería impedir registrar el pago, o sea impedir cobrar.
    const clinicId = request.user?.clinicId;
    if (!clinicId) return next.handle();

    // `/auth/*` queda afuera aunque venga con JWT: si no, una cuenta en mora no
    // podría ni renovar el token ni cerrar sesión.
    const ruta = request.path ?? request.url ?? '';
    if (ruta.startsWith('/auth')) return next.handle();

    const clinic = await this.clinicModel
      .findById(new Types.ObjectId(clinicId))
      .select('status subscriptionEndsAt trialEndsAt')
      .lean<Clinic>()
      .exec();
    if (!clinic) return next.handle();

    if (isReadonly(clinic)) {
      // Con `code`, siguiendo la convención que ya usa MUST_CHANGE_PASSWORD.
      // El front necesita distinguir ESTE 403 de uno de permisos para mostrar
      // el motivo real: los `onError` de las pantallas tienen textos fijos
      // ("No se pudo crear el paciente") que se leen como una falla del
      // sistema y mandarían al Dr. a reintentar algo que nunca va a andar.
      throw new ForbiddenException({
        code: 'ACCOUNT_READONLY',
        message:
          'La cuenta está en modo solo lectura por falta de pago. ' +
          'Podés consultar las fichas; para volver a cargar información, ' +
          'coordiná el pago con el administrador.',
      });
    }
    return next.handle();
  }
}
