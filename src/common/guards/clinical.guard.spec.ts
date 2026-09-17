import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClinicalGuard, veClinico } from './clinical.guard';

const ctx = (user: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('veClinico', () => {
  it('el titular ve lo clínico, sea o no profesional', () => {
    expect(veClinico({ role: 'OWNER', isClinical: true })).toBe(true);
    expect(veClinico({ role: 'OWNER', isClinical: false })).toBe(true);
  });

  it('un profesional (miembro clínico) ve lo clínico', () => {
    expect(veClinico({ role: 'MEMBER', isClinical: true })).toBe(true);
  });

  it('el Asistente (miembro no clínico) no', () => {
    expect(veClinico({ role: 'MEMBER', isClinical: false })).toBe(false);
  });

  it('sin usuario, no', () => {
    expect(veClinico(undefined)).toBe(false);
    expect(veClinico(null)).toBe(false);
  });
});

describe('ClinicalGuard', () => {
  const guard = new ClinicalGuard();

  it('deja pasar al profesional', () => {
    expect(guard.canActivate(ctx({ role: 'MEMBER', isClinical: true }))).toBe(
      true,
    );
  });

  it('rechaza al Asistente con un mensaje en español', () => {
    expect(() =>
      guard.canActivate(ctx({ role: 'MEMBER', isClinical: false })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(ctx({ role: 'MEMBER', isClinical: false })),
    ).toThrow('Tu usuario no tiene acceso a la información clínica');
  });
});
