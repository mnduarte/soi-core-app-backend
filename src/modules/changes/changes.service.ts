import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

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

@Injectable()
export class ChangesService {
  constructor(@InjectConnection() private readonly conn: Connection) {}

  async getChanges(clinicId: string): Promise<Record<string, number>> {
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

    return out;
  }
}
