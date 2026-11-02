import { Types } from 'mongoose';
import { Model } from 'mongoose';
import { UsersService } from './users.service';
import { UserDocument } from './schemas/user.schema';

/**
 * El estado de las ayudas de primera vez se guarda SUMANDO, nunca pisando.
 *
 * La misma persona usa la app en la tablet del consultorio y en la
 * computadora, y las dos mandan su lista entera cada vez que se cierra un
 * globo. Si la última en escribir ganara, lo cerrado en una volvería a salir
 * en la otra — que es justo el problema que esto vino a resolver.
 *
 * Lo otro que se prueba acá es el saneo: `contadores` es un objeto libre que
 * viaja al documento del usuario y queda ahí para siempre, y class-validator
 * no mira adentro.
 */
describe('UsersService — el avance de las ayudas', () => {
  const CLINICA = new Types.ObjectId().toHexString();
  const USUARIO = new Types.ObjectId().toHexString();

  /** Un usuario de mentira con el `tour` que le pasemos y un `save` que no
   *  hace nada: lo que importa es qué quedó en el documento. */
  function servicioCon(tour?: UserDocument['tour']) {
    const doc = { tour, save: jest.fn() } as unknown as UserDocument;
    const model = {
      findOne: () => ({ select: () => ({ exec: () => Promise.resolve(doc) }) }),
    } as unknown as Model<UserDocument>;
    return { service: new UsersService(model), doc };
  }

  it('une las vistas en vez de reemplazarlas', async () => {
    const { service } = servicioCon({
      vistas: ['bienvenida', 'horarios'],
      contadores: {},
    });

    const tour = await service.updateTour(CLINICA, USUARIO, {
      vistas: ['bienvenida', 'pacientes'],
    });

    expect(tour.vistas.sort()).toEqual(['bienvenida', 'horarios', 'pacientes']);
  });

  it('se queda con el contador más alto', async () => {
    const { service } = servicioCon({
      vistas: [],
      contadores: { turnos: 5, trabajos: 2 },
    });

    const tour = await service.updateTour(CLINICA, USUARIO, {
      contadores: { turnos: 3, trabajos: 7 },
    });

    // 5 es el de la tablet, que vio más historia; 7 el de la compu.
    expect(tour.contadores).toEqual({ turnos: 5, trabajos: 7 });
  });

  it('no toca lo que no viene en el pedido', async () => {
    const { service } = servicioCon({
      vistas: ['bienvenida'],
      contadores: { turnos: 4 },
    });

    const tour = await service.updateTour(CLINICA, USUARIO, {
      vistas: ['pacientes'],
    });

    expect(tour.contadores).toEqual({ turnos: 4 });
  });

  it('descarta claves y valores que no tienen forma de contador', async () => {
    const { service } = servicioCon({ vistas: [], contadores: {} });

    const tour = await service.updateTour(CLINICA, USUARIO, {
      contadores: {
        turnos: 2,
        'Clave Rara': 9,
        larguisima_y_con_simbolos_$$$: 9,
        texto: 'tres' as unknown as number,
        infinito: Infinity,
        negativo: -5,
        gigante: 1e12,
        decimal: 2.7,
      },
    });

    expect(tour.contadores).toEqual({
      turnos: 2,
      negativo: 0,
      gigante: 100000,
      decimal: 2,
    });
  });

  it('arranca de cero para quien nunca vio una ayuda', async () => {
    const { service } = servicioCon(undefined);

    const tour = await service.updateTour(CLINICA, USUARIO, {
      vistas: ['bienvenida'],
    });

    expect(tour).toEqual({ vistas: ['bienvenida'], contadores: {} });
  });

  it('"volver a ver" borra las banderas Y los contadores', async () => {
    // Los contadores también: hay ayudas que salen al segundo turno o al
    // segundo trabajo, y con la cuenta vieja esas no volverían a aparecer.
    const { service } = servicioCon({
      vistas: ['bienvenida'],
      contadores: { turnos: 9 },
    });

    const tour = await service.resetTour(CLINICA, USUARIO);

    expect(tour).toEqual({ vistas: [], contadores: {} });
  });
});
