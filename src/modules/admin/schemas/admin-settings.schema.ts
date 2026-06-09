import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminSettingsDocument = AdminSettings & Document;

// Singleton document holding the SaaS-level configuration the super-admin
// tweaks (grace period, plan price). We always look up the first document of
// the collection; there's no need for indexes.
@Schema({ collection: 'admin_settings', timestamps: true })
export class AdminSettings {
  @Prop({ default: 3 })
  gracePeriodDays: number;

  @Prop({ default: 28000 })
  planPriceMonthly: number;

  // Free trial duration applied to newly-created clinics. After this many
  // days the clinic moves through the same due-soon → overdue → grace-end
  // flow a paid subscription does — we just count from `trialEndsAt`
  // instead of `subscriptionEndsAt`.
  @Prop({ default: 45 })
  trialDays: number;
}

export const AdminSettingsSchema = SchemaFactory.createForClass(AdminSettings);
