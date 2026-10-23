import { ConfigService } from '@nestjs/config';
import { FichaScanService } from './ficha-scan.service';

/**
 * Qué se deja pasar al formulario después de leer una ficha de papel.
 *
 * El escenario feo: el formulario calcula la edad desde la fecha de
 * nacimiento, así que una fecha mal leída no se queda quieta en su casillero
 * — pisa la edad que el papel traía bien escrita. Pasó de verdad con una
 * ficha que dice "Edad: 13": el año estaba borroneado, se leyó "2026-06-12" y
 * el alta quedó con 0 años.
 */
describe('FichaScanService — qué fechas de nacimiento se aceptan', () => {
  const service = new FichaScanService({ get: () => undefined } as unknown as ConfigService);
  const leer = (datos: Record<string, string>) =>
    (service as unknown as { parse(raw: string): Record<string, string> }).parse(
      JSON.stringify(datos),
    );

  it('descarta la fecha que no cierra con la edad escrita, y conserva la edad', () => {
    const r = leer({ age: '13', birthDate: '2026-06-12', phone: '1168061101' });
    expect(r.birthDate).toBeUndefined();
    expect(r.age).toBe('13');
    // Lo demás de la ficha no se toca: se cae un campo, no la lectura entera.
    expect(r.phone).toBe('1168061101');
  });

  it('acepta la fecha que sí cierra con la edad escrita', () => {
    const año = new Date().getFullYear() - 13;
    const r = leer({ age: '13', birthDate: `${año}-06-12` });
    expect(r.birthDate).toBe(`${año}-06-12`);
  });

  it('acepta que la fecha dé MÁS años que la edad escrita: la ficha es vieja', () => {
    // Ficha abierta hace diez años: decía 13, hoy el paciente tiene 23. La
    // fecha es el dato bueno; la edad escrita es la que envejeció.
    const año = new Date().getFullYear() - 23;
    const r = leer({ age: '13', birthDate: `${año}-06-12` });
    expect(r.birthDate).toBe(`${año}-06-12`);
  });

  it('tolera el cumpleaños sin cumplir', () => {
    // Nacido a fin de año: hoy tiene 12 y pico y el papel dice 13. Es la
    // diferencia de siempre entre la edad cumplida y la del año en curso, no
    // una fecha mal leída.
    const año = new Date().getFullYear() - 13;
    const r = leer({ age: '13', birthDate: `${año}-12-31` });
    expect(r.birthDate).toBe(`${año}-12-31`);
  });

  it('descarta una fecha futura aunque no haya edad para comparar', () => {
    const r = leer({ birthDate: `${new Date().getFullYear() + 2}-01-01` });
    expect(r.birthDate).toBeUndefined();
  });

  it('descarta una fecha absurda por vieja', () => {
    expect(leer({ birthDate: '1820-01-01' }).birthDate).toBeUndefined();
  });

  it('acepta la fecha sola cuando la ficha no trae edad escrita', () => {
    const r = leer({ birthDate: '1990-05-20' });
    expect(r.birthDate).toBe('1990-05-20');
  });
});
