import { patronSinAcentos, regexSinAcentos } from './busqueda';

describe('regexSinAcentos', () => {
  // Los casos reales: el padrón del consultorio tiene tildes y se escribe con
  // el paciente enfrente.
  it('encuentra un nombre con tilde escribiéndolo sin tilde', () => {
    expect(regexSinAcentos('luci').test('Lucía')).toBe(true);
    expect(regexSinAcentos('benavidez').test('Benavídez')).toBe(true);
    expect(regexSinAcentos('rocio').test('Rocío')).toBe(true);
    expect(regexSinAcentos('damian').test('Damián')).toBe(true);
  });

  it('y también al revés: con tilde encuentra lo guardado sin tilde', () => {
    expect(regexSinAcentos('Lucía').test('Lucia')).toBe(true);
    expect(regexSinAcentos('Benavídez').test('benavidez')).toBe(true);
  });

  it('no distingue mayúsculas de minúsculas', () => {
    expect(regexSinAcentos('MARCELA').test('Marcela Ibarrola')).toBe(true);
    expect(regexSinAcentos('ibarrola').test('Marcela IBARROLA')).toBe(true);
  });

  it('sigue siendo búsqueda parcial', () => {
    expect(regexSinAcentos('nav').test('Lucía Benavídez')).toBe(true);
  });

  it('la ñ cuenta como n, y la c como ç', () => {
    expect(regexSinAcentos('muniz').test('Muñiz')).toBe(true);
    expect(regexSinAcentos('goncalves').test('Gonçalves')).toBe(true);
  });

  it('no encuentra lo que no está', () => {
    expect(regexSinAcentos('perez').test('Lucía Benavídez')).toBe(false);
  });

  it('los caracteres de expresión regular se neutralizan', () => {
    // Sin escapar, un punto haría match con cualquier letra y un paréntesis
    // suelto rompería la expresión entera.
    expect(regexSinAcentos('a.c').test('abc')).toBe(false);
    expect(regexSinAcentos('a.c').test('a.c')).toBe(true);
    expect(() => regexSinAcentos('lucia (')).not.toThrow();
    expect(() => regexSinAcentos('*')).not.toThrow();
  });

  it('el patrón abre cada letra en sus variantes', () => {
    expect(patronSinAcentos('luci')).toBe('l[uúùüû][cç][iíìïî]');
  });
});
