import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string;
  email: string;
  clinicId: string;
  role: string;
  isClinical: boolean;
  // Session id = the refresh token's _id. Lets the session-status poll detect
  // when this device's session was evicted (device cap / logout). Optional for
  // backwards compatibility with tokens issued before it existed.
  sid?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtPayload;
  },
);
