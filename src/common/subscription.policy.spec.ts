import { paidPeriod } from './subscription.policy';

/**
 * El ciclo de cobro cae SIEMPRE el día 1.
 *
 * Los casos salieron de uno real: un consultorio con el vencimiento corrido al
 * 19 pagaba "septiembre" y el 22 ya tenía el primer aviso, porque el registro
 * de pagos sumaba un mes desde donde estuviera la fecha en vez de cerrar el mes
 * calendario.
 */
describe('paidPeriod', () => {
  const hoy = new Date(2026, 8, 11); // 11 de septiembre de 2026

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it('cierra el mes calendario aunque el vencimiento esté corrido', () => {
    const { from, to } = paidPeriod(new Date(2026, 8, 19, 2, 43), 1, hoy);
    expect(iso(from)).toBe('2026-09-19');
    // Septiembre entero: el 1 de octubre arranca el ciclo nuevo.
    expect(to.getDate()).toBe(1);
    expect(to.getMonth()).toBe(9);
  });

  it('el que paga adelantado SUMA un mes, no pierde lo cubierto', () => {
    const { to } = paidPeriod(new Date(2026, 9, 1), 1, hoy);
    expect(to.getMonth()).toBe(10); // noviembre
    expect(to.getDate()).toBe(1);
  });

  it('si lo cubierto quedó en el pasado, se paga el mes en curso', () => {
    const { from, to } = paidPeriod(new Date(2026, 7, 1), 1, hoy);
    expect(from.getMonth()).toBe(8); // arranca el 1 de septiembre
    expect(from.getDate()).toBe(1);
    expect(to.getMonth()).toBe(9);
  });

  it('sin nada cubierto arranca el 1 de este mes', () => {
    const { from, to } = paidPeriod(null, 1, hoy);
    expect(iso(from)).toBe('2026-09-01');
    expect(iso(to)).toBe('2026-10-01');
  });

  it('varios meses de una sola vez', () => {
    const { to } = paidPeriod(new Date(2026, 8, 19), 3, hoy);
    expect(to.getMonth()).toBe(11); // diciembre
    expect(to.getDate()).toBe(1);
  });

  it('cruza el año sin romperse', () => {
    const { to } = paidPeriod(null, 1, new Date(2026, 11, 15));
    expect(to.getFullYear()).toBe(2027);
    expect(to.getMonth()).toBe(0);
    expect(to.getDate()).toBe(1);
  });
});
