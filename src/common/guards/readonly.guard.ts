import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

@Injectable()
export class ReadonlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method: string;
      clinic?: { isReadonly?: boolean };
    }>();

    if (!MUTATING_METHODS.includes(request.method)) return true;

    if (request.clinic?.isReadonly) {
      throw new ForbiddenException(
        'La cuenta está en modo solo lectura. Renovar suscripción para continuar.',
      );
    }
    return true;
  }
}
