/**
 * Migración: ítems embebidos de `TreatmentPlan.items[]` → colección plana `works`.
 *
 * Uno a uno, sin complicar: cada ítem se copia a un documento `Work`
 * PRESERVANDO SU `_id` original — así los vínculos foto↔trabajo
 * (`GalleryPhoto.treatmentItemId == item._id`) siguen apuntando bien. El estado
 * se mantiene tal cual (COMPLETED = hecho/historial, el resto = plan de
 * tratamiento). No se generan pagos sintéticos: los montos ya cobrados viven en
 * `transactions`, la Falta se calcula de works(hechos) − pagos.
 *
 * Idempotente: si ya existe un `Work` con ese `_id`, lo saltea. NO borra ni toca
 * los `TreatmentPlan` viejos (quedan intactos para rollback).
 *
 * Correr (fuera del sandbox, con el .env que apunta a la Atlas correcta):
 *   npx ts-node -r tsconfig-paths/register src/scripts/migrate-items-to-works.ts
 *   npx ts-node -r tsconfig-paths/register src/scripts/migrate-items-to-works.ts --dry
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import {
  TreatmentPlan,
  TreatmentPlanDocument,
} from '../modules/treatment-plans/schemas/treatment-plan.schema';
import { Work, WorkDocument } from '../modules/works/schemas/work.schema';
import { Types } from 'mongoose';

const DRY = process.argv.includes('--dry');

// Forma de un ítem embebido legacy (venían como Mixed/Object en el plan).
interface LegacyItem {
  _id?: Types.ObjectId;
  description?: string;
  toothNumber?: string;
  surface?: string;
  price?: number;
  status?: string;
  completedAt?: Date;
  estimatedDate?: Date;
  notes?: string;
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const planModel = app.get<Model<TreatmentPlanDocument>>(
    getModelToken(TreatmentPlan.name),
  );
  const workModel = app.get<Model<WorkDocument>>(getModelToken(Work.name));

  // Incluye planes borrados (soft-deleted): sus ítems también pueden tener fotos
  // vinculadas; se migran igual y quedan con deletedAt seteado en el Work.
  const plans = await planModel.find({}).lean().exec();
  console.log(
    `[migrate] ${plans.length} treatment plans a procesar${DRY ? ' (DRY RUN)' : ''}`,
  );

  let created = 0;
  let skipped = 0;
  let items = 0;

  for (const plan of plans) {
    const planItems: LegacyItem[] = Array.isArray(plan.items) ? plan.items : [];
    for (const item of planItems) {
      items++;
      if (!item?._id) {
        console.warn(
          `[migrate] ítem sin _id en plan ${String(plan._id)}, salteado`,
        );
        skipped++;
        continue;
      }

      const exists = await workModel.exists({ _id: item._id });
      if (exists) {
        skipped++;
        continue;
      }

      const doc = {
        _id: item._id,
        clinicId: plan.clinicId,
        patientId: plan.patientId,
        description: item.description ?? '(sin nombre)',
        toothNumber: item.toothNumber,
        surface: item.surface,
        price: typeof item.price === 'number' ? item.price : 0,
        status: item.status ?? 'PROPOSED',
        completedAt: item.completedAt,
        estimatedDate: item.estimatedDate,
        notes: item.notes,
        // Auditoría: arrastra la del plan de origen.
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        createdBy: plan.createdBy,
        updatedBy: plan.updatedBy,
        deletedAt: plan.deletedAt ?? null,
        deletedBy: plan.deletedBy,
      };

      if (DRY) {
        console.log(
          `[migrate] (dry) crearía Work ${String(item._id)} "${doc.description}" [${doc.status}] $${doc.price}`,
        );
      } else {
        await workModel.collection.insertOne(doc);
      }
      created++;
    }
  }

  console.log(
    `[migrate] listo. ítems: ${items} · creados: ${created} · salteados (ya existían/sin _id): ${skipped}`,
  );
  await app.close();
}

run().catch((err) => {
  console.error('[migrate] ERROR', err);
  process.exit(1);
});
