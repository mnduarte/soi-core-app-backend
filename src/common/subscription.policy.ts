import {
  Clinic,
  SubscriptionStatus,
} from '../modules/clinics/schemas/clinic.schema';

/**
 * Política de mora, en un solo lugar.
 *
 * Antes los días vivían sueltos dentro de auth.service (dos `addDays(…, 7)`
 * repetidos) y el cartel del front calculaba los suyos por su cuenta. O sea que
 * el aviso podía prometer algo distinto de lo que el sistema hacía. Acá se
 * define una vez y lo consumen los dos: el guard que corta y el cartel que avisa.
 *
 * La escalera, contada en días DESDE EL VENCIMIENTO:
 *
 *   0   acceso completo · SIN aviso           a principio de mes muchos todavía
 *                                              no cobraron; avisar el día 1 es
 *                                              apurar a alguien que no se atrasó
 *   3   acceso completo · aviso suave         "no nos figura el pago"
 *  10   acceso completo · aviso firme         anuncia la fecha del corte
 *  15   SOLO LECTURA                          consulta fichas, no carga nada
 *  30   SIN ACCESO
 *
 * Solo lectura y no bloqueo al día 15 a propósito: que el odontólogo pueda
 * mirar la historia clínica del paciente que tiene en el sillón aunque deba
 * dos semanas. Para presionar alcanza con que no pueda trabajar.
 */
export const AVISO_SUAVE_DAYS = 3;
export const AVISO_FIRME_DAYS = 10;
export const READONLY_AFTER_DAYS = 15;
export const BLOCK_AFTER_DAYS = 30;

/**
 * Meses de prueba al dar de alta un consultorio.
 *
 * Se cuentan por mes CALENDARIO y el mes del alta cuenta entero: alguien que
 * arranca el 15 de junio tiene junio y julio, y el primer cobro le cae el 1 de
 * agosto. Es más simple de explicar que "60 días desde el alta" y hace que
 * todos los vencimientos caigan el día 1, igual que el débito automático.
 */
export const TRIAL_MONTHS = 2;

/** Cuándo termina la prueba de un consultorio dado de alta en `createdAt`. */
export function trialEndFor(createdAt: Date): Date {
  // Primer día del mes (alta + TRIAL_MONTHS): el 1 de agosto para un alta de
  // junio. Ese día ya cuenta como día 0 de mora.
  return new Date(
    createdAt.getFullYear(),
    createdAt.getMonth() + TRIAL_MONTHS,
    1,
    0,
    0,
    0,
  );
}

/** En qué mes de prueba va (1..TRIAL_MONTHS), o 0 si ya terminó. */
export function trialMonthNumber(createdAt: Date, now = new Date()): number {
  const meses =
    (now.getFullYear() - createdAt.getFullYear()) * 12 +
    (now.getMonth() - createdAt.getMonth());
  return meses >= TRIAL_MONTHS ? 0 : meses + 1;
}

const MS_PER_DAY = 86_400_000;

export type SubscriptionLevel = 'ok' | 'soft' | 'firm' | 'readonly' | 'blocked';

export interface SubscriptionState {
  level: SubscriptionLevel;
  /** true = la fecha de corte es el fin de la prueba, no un vencimiento de pago. */
  trial: boolean;
  /** Días cumplidos desde el vencimiento. Negativo si todavía no venció. */
  daysOverdue: number;
  dueAt: string | null;
  /** Cuándo pasa a solo lectura, para poder anunciarlo con fecha. */
  readonlyAt: string | null;
  blockedAt: string | null;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/**
 * Estado de mora del consultorio.
 *
 * La fecha contra la que se mide depende de en qué está: un consultorio en
 * prueba se mide contra el fin de la prueba, uno que ya pagó contra su
 * vencimiento. Antes solo se miraba `subscriptionEndsAt`, así que una prueba
 * vencida no restringía nada y podía quedar usando el sistema para siempre.
 */
export function subscriptionState(clinic: Clinic): SubscriptionState {
  const enPrueba = clinic.status === SubscriptionStatus.TRIAL;
  const base: SubscriptionState = {
    level: 'ok',
    trial: enPrueba,
    daysOverdue: 0,
    dueAt: null,
    readonlyAt: null,
    blockedAt: null,
  };
  const due = enPrueba ? clinic.trialEndsAt : clinic.subscriptionEndsAt;
  if (!due) return base;

  const daysOverdue = Math.floor((Date.now() - due.getTime()) / MS_PER_DAY);
  const state: SubscriptionState = {
    ...base,
    daysOverdue,
    dueAt: due.toISOString(),
    readonlyAt: addDays(due, READONLY_AFTER_DAYS).toISOString(),
    blockedAt: addDays(due, BLOCK_AFTER_DAYS).toISOString(),
  };

  if (daysOverdue >= BLOCK_AFTER_DAYS) return { ...state, level: 'blocked' };
  if (daysOverdue >= READONLY_AFTER_DAYS)
    return { ...state, level: 'readonly' };
  if (daysOverdue >= AVISO_FIRME_DAYS) return { ...state, level: 'firm' };
  if (daysOverdue >= AVISO_SUAVE_DAYS) return { ...state, level: 'soft' };
  // Los primeros días no muestran nada: el corte real está lejos y el aviso
  // solo lograría que alguien que paga en fecha se sienta apurado.
  return state;
}

/**
 * Puede entrar y consultar, pero no guardar nada.
 *
 * La suspensión manual desde el backoffice sigue contando acá, igual que
 * antes. En la práctica esa cuenta ni siquiera puede iniciar sesión (lo corta
 * `canLogin`), pero se respeta el contrato que ya existía para no cambiar de
 * costado algo que hoy funciona.
 */
export function isReadonly(clinic: Clinic): boolean {
  if (clinic.status === SubscriptionStatus.SUSPENDED) return true;
  // `blocked` cuenta también. Es un escalón MÁS restrictivo que `readonly`, no
  // un camino distinto: comparar solo contra 'readonly' hacía que al día 30 la
  // cuenta volviera a poder escribir. El login sí la frena, pero `refresh` no
  // vuelve a mirar la clínica, así que una sesión ya abierta se renovaba sola y
  // seguía trabajando — con el backoffice mostrando "sin acceso".
  const { level } = subscriptionState(clinic);
  return level === 'readonly' || level === 'blocked';
}

/** No puede ni entrar. */
export function isFullyBlocked(clinic: Clinic): boolean {
  return subscriptionState(clinic).level === 'blocked';
}
