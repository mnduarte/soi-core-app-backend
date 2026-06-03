import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ClinicId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.clinicId as string;
  },
);
