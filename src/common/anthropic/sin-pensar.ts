/**
 * Cómo se le pide a cada familia de modelos que NO razone antes de responder.
 *
 * Los Claude 5 piensan por su cuenta cuando les parece, y para una tarea de
 * esquema fijo —repartir una frase en campos, elegir una opción de una lista—
 * eso no suma: gasta el presupuesto de tokens y puede dejar la respuesta
 * cortada a la mitad. Pasó de verdad: 672 de 700 tokens gastados pensando, el
 * JSON cortado en el segundo campo y el formulario sin llenarse, sin ningún
 * error visible.
 *
 * Lo molesto es que cada familia lo apaga distinto, y mandar la forma
 * equivocada no se degrada: devuelve 400 y la función entera deja de andar.
 * Como el modelo es configurable por env, acá se elige la forma correcta en vez
 * de clavar una sola. Las tres verificadas contra la API (0 tokens pensados).
 *
 * Esto NO va en tareas donde razonar sí ayuda — leer una ficha manuscrita y
 * torcida, por ejemplo. Ahí se deja pensar; ver ficha-scan.service.ts.
 */
export function sinPensar(model: string): Record<string, unknown> {
  if (model.includes('opus')) {
    // Opus no acepta "disabled": se le baja el esfuerzo al mínimo.
    return { thinking: { type: 'adaptive' }, output_config: { effort: 'low' } };
  }
  if (model.includes('sonnet')) {
    return { thinking: { type: 'between_tools' } };
  }
  // Haiku (el que usamos por defecto) y anteriores.
  return { thinking: { type: 'disabled' } };
}
