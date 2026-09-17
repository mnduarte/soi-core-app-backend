import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Quién puede ver lo clínico: el titular y los profesionales.
 *
 * El Asistente (miembro NO clínico) trabaja en la recepción: agenda turnos y
 * carga los datos de contacto del paciente, pero no ve trabajos, pagos, saldos,
 * odontograma, fotos ni evoluciones. Es la misma regla en todos lados, así que
 * vive en una sola función: la usan esta guarda y los endpoints de pacientes,
 * que el Asistente sí usa pero con la parte clínica recortada.
 *
 * El titular pasa siempre, aunque no sea clínico: es el dueño del consultorio.
 */
export function veClinico(
  user?: Pick<JwtPayload, 'role' | 'isClinical'> | null,
): boolean {
  return user?.role === 'OWNER' || user?.isClinical === true;
}

/**
 * Cierra un endpoint (o un controller entero) a quien no ve lo clínico.
 * Va DESPUÉS de JwtAuthGuard, que es el que carga `req.user`.
 *
 * Esconder el menú en el front no protege nada: cualquiera con la sesión puede
 * pedir la URL a mano. Esto es lo que protege.
 */
@Injectable()
export class ClinicalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (veClinico(user)) return true;
    throw new ForbiddenException(
      'Tu usuario no tiene acceso a la información clínica',
    );
  }
}
