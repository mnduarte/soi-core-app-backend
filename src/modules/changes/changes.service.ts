import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { Clinic } from '../clinics/schemas/clinic.schema';
import {
  subscriptionState,
  type SubscriptionState,
} from '../../common/subscription.policy';

// Heartbeat de versiones (Opción 2 de sync cross-device).
// Cada key es un "recurso" observable desde los frontends; el valor es el
// `updatedAt` más reciente (en ms epoch) de ESA colección para la clínica.
// Los fronts guardan el mapa anterior y, cuando un timestamp sube, invalidan
// las queries de react-query asociadas → refetch. Así una sola request liviana
// cada ~12s cubre agenda + pacientes + ficha sin pollear cada lista por separado.
//
// Importante: NO filtramos `deletedAt` acá. Un soft-delete también toca
// `updatedAt` (setea deletedAt), así que borrar algo en un dispositivo también
// bumpea el heartbeat y el otro se entera.
const COLLECTIONS: Record<string, string> = {
  appointments: 'appointments',
  dayNotes: 'daynotes',
  patients: 'patients',
  works: 'works',
  transactions: 'transactions',
  gallery: 'gallerysessions',
  odontograms: 'odontograms',
  clinicalEntries: 'clinicalentries',
};

/**
 * Cada cuánto, como mucho, se refresca `lastSeenAt`.
 *
 * El latido llega cada 10s, pero escribir cada 10s serían ~360 escrituras por
 * hora por consultorio abierto, para un dato que se mira de a ratos. Con 3
 * minutos el backoffice igual distingue "está adentro ahora" de "estuvo esta
 * mañana", que es toda la precisión que la pregunta necesita.
 */
const LATIDO_MIN_MS = 3 * 60 * 1000;

@Injectable()
export class ChangesService {
  constructor(@InjectConnection() private readonly conn: Connection) {}

  async getChanges(clinicId: string, imp = false): Promise<ChangesResponse> {
    const oid = new Types.ObjectId(clinicId);
    const out: Record<string, number> = {};

    // Una query por colección, pero cada una es un findOne ordenado por
    // updatedAt desc → trae 1 documento. Con data chica (clínicas pequeñas)
    // es trivial. Si alguna colección crece mucho, un índice compuesto
    // { clinicId: 1, updatedAt: -1 } la vuelve O(1).
    await Promise.all(
      Object.entries(COLLECTIONS).map(async ([key, coll]) => {
        const doc = await this.conn
          .collection(coll)
          .find({ clinicId: oid }, { projection: { updatedAt: 1 } })
          .sort({ updatedAt: -1 })
          .limit(1)
          .next();
        const ts = doc?.updatedAt
          ? new Date(doc.updatedAt as Date).getTime()
          : 0;
        out[key] = ts;
      }),
    );

    // El estado de la suscripción viaja en el mismo latido. Es lo que permite
    // que el cartel de mora desaparezca solo cuando se registra el pago: antes
    // `subscriptionEndsAt` se guardaba en el navegador al iniciar sesión y no
    // se volvía a pedir, así que el aviso seguía ahí hasta el próximo login.
    // Va como objeto aparte de los timestamps para no ensuciar el diff.
    const clinic = await this.conn
      .collection<Clinic>('clinics')
      .findOne({ _id: oid } as never);

    // Presencia: "hay alguien con la app delante", que es distinto de
    // `lastLoginAt` ("cuándo entró"). El backoffice mostraba lo segundo con
    // cara de lo primero: decía "En línea ahora" de alguien que se logueó y
    // cerró la notebook, y "hace 3 h" de alguien trabajando en ese momento.
    //
    // No cuesta una query extra: el documento ya se leyó arriba para el estado
    // de la suscripción, así que acá solo se decide si hace falta escribir, y
    // como mucho pasa una vez cada LATIDO_MIN_MS.
    //
    // Sin `await` a propósito: es telemetría. Que el latido —del que dependen
    // la agenda y el cartel de mora— espere por esto, o peor, falle por esto,
    // no se justifica.
    if (clinic && !imp) {
      const visto = clinic.lastSeenAt
        ? new Date(clinic.lastSeenAt).getTime()
        : 0;
      if (Date.now() - visto > LATIDO_MIN_MS) {
        void this.conn
          .collection('clinics')
          .updateOne({ _id: oid }, { $set: { lastSeenAt: new Date() } })
          .catch(() => undefined);
      }
    }

    return {
      resources: out,
      subscription: clinic
        ? subscriptionState(clinic)
        : {
            level: 'ok',
            trial: false,
            daysOverdue: 0,
            dueAt: null,
            readonlyAt: null,
            blockedAt: null,
          },
    };
  }
}

export interface ChangesResponse {
  /** recurso → ultimo updatedAt (ms epoch). El front compara y refetchea. */
  resources: Record<string, number>;
  subscription: SubscriptionState;
}
