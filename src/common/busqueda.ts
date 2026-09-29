/**
 * Buscar sin depender de los acentos.
 *
 * En el consultorio se escribe con el paciente enfrente: "luci" tiene que
 * encontrar a "Lucía" y "benavidez" a "Benavídez". La búsqueda ya ignoraba
 * mayúsculas, pero la `i` y la `í` son caracteres distintos, así que una tilde
 * de más o de menos dejaba la lista vacía justo cuando hay apuro.
 *
 * Se resuelve del lado del patrón y no de los datos: cada letra se convierte en
 * el grupo de sus variantes, así que el acento puede faltar o sobrar en
 * cualquiera de los dos lados. La alternativa —guardar una copia normalizada de
 * cada nombre— es más rápida, pero pide un campo nuevo, migrar lo que ya está y
 * mantenerlo al día en cada alta y cada edición. Para un padrón de cientos de
 * pacientes no hace falta pagar eso.
 */
const EQUIVALENTES: Record<string, string> = {
  a: 'aáàäâã',
  e: 'eéèëê',
  i: 'iíìïî',
  o: 'oóòöôõ',
  u: 'uúùüû',
  n: 'nñ',
  c: 'cç',
};

/** De cualquier variante a su letra base: í → i, Ñ → n. */
const BASE = new Map<string, string>();
for (const [base, variantes] of Object.entries(EQUIVALENTES)) {
  for (const v of variantes) BASE.set(v, base);
}

/** Lo que en una expresión regular significa otra cosa y hay que neutralizar. */
const ESPECIALES = /[.*+?^${}()|[\]\\]/;

/**
 * Convierte un texto en un patrón que ignora acentos.
 *
 * "luci" devuelve `l[uúùüû]c[iíìïî]`, que con la bandera `i` encuentra Lucía,
 * LUCIA y lucia.
 */
export function patronSinAcentos(texto: string): string {
  return [...texto.toLowerCase()]
    .map((ch) => {
      const base = BASE.get(ch);
      if (base) return `[${EQUIVALENTES[base]}]`;
      return ESPECIALES.test(ch) ? `\\${ch}` : ch;
    })
    .join('');
}

/** El patrón ya armado como expresión regular, sin distinguir mayúsculas. */
export function regexSinAcentos(texto: string): RegExp {
  return new RegExp(patronSinAcentos(texto), 'i');
}
