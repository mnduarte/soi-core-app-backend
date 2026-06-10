import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import * as argon2 from 'argon2';
import { User, UserRole } from './modules/users/schemas/user.schema';
import { Clinic, SubscriptionStatus } from './modules/clinics/schemas/clinic.schema';
import { AdminUser } from './modules/admin-auth/schemas/admin-user.schema';

const MS_PER_DAY = 86_400_000;
const daysFromNow = (n: number) => new Date(Date.now() + n * MS_PER_DAY);

interface SeedClinic {
  name: string;
  slug: string;
  doctorName: string;
  city: string;
  phone: string;
  contactEmail?: string;
  brandColor: string;
  status: SubscriptionStatus;
  daysToDue: number | null;
}

// Mix of states designed so the backoffice's morosidad banners all trigger:
// 1 grace-end (suspension imminent), 1 overdue within grace, 1 due-soon,
// the rest healthy plus 1 SUSPENDED and 1 TRIAL.
const SEED_CLINICS: SeedClinic[] = [
  {
    name: 'Clínica Demo',
    slug: 'demo-clinic',
    doctorName: 'Dr. Demo',
    city: 'CABA',
    phone: '+54 9 11 5000-0000',
    contactEmail: 'demo@molar.local',
    brandColor: '#2F54EB',
    status: SubscriptionStatus.ACTIVE,
    daysToDue: 25,
  },
  {
    name: 'Sonrisas del Sur',
    slug: 'sonrisas-del-sur',
    doctorName: 'Dra. Renata Acosta',
    city: 'Caseros',
    phone: '+54 9 11 5821-4490',
    contactEmail: 'hola@sonrisasdelsur.ar',
    brandColor: '#2F54EB',
    status: SubscriptionStatus.ACTIVE,
    daysToDue: 21,
  },
  {
    name: 'OdontoCaseros',
    slug: 'odontocaseros',
    doctorName: 'Dr. Martín Caseros',
    city: 'Caseros',
    phone: '+54 9 11 4408-1192',
    brandColor: '#06A37A',
    status: SubscriptionStatus.ACTIVE,
    daysToDue: 4,
  },
  {
    name: 'Estudio Vega',
    slug: 'estudio-vega',
    doctorName: 'Dra. Catalina Vega',
    city: 'Olivos',
    phone: '+54 9 11 5567-1180',
    brandColor: '#E11D48',
    status: SubscriptionStatus.ACTIVE,
    daysToDue: -2,
  },
  {
    name: 'Dental Olivos',
    slug: 'dental-olivos',
    doctorName: 'Dr. Mateo Romero',
    city: 'Olivos',
    phone: '+54 9 11 4490-7762',
    contactEmail: 'turnos@dentalolivos.ar',
    brandColor: '#0EA5E9',
    status: SubscriptionStatus.ACTIVE,
    daysToDue: -6,
  },
  {
    name: 'Consultorio Herrera',
    slug: 'consultorio-herrera',
    doctorName: 'Dra. Delfina Herrera',
    city: 'Vicente López',
    phone: '+54 9 11 3318-9025',
    brandColor: '#D97706',
    status: SubscriptionStatus.SUSPENDED,
    daysToDue: -9,
  },
  {
    name: 'OrtoKids',
    slug: 'ortokids',
    doctorName: 'Dra. Emilia Suárez',
    city: 'CABA',
    phone: '+54 9 11 5102-8841',
    contactEmail: 'hola@ortokids.com.ar',
    brandColor: '#DB2777',
    status: SubscriptionStatus.ACTIVE,
    daysToDue: 28,
  },
  {
    name: 'Sonría Odontología',
    slug: 'sonria-odontologia',
    doctorName: 'Dr. Benjamín Silva',
    city: 'CABA',
    phone: '+54 9 11 6624-3307',
    brandColor: '#2F54EB',
    status: SubscriptionStatus.TRIAL,
    daysToDue: null,
  },
];

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const clinicModel = app.get<Model<Clinic>>(getModelToken(Clinic.name));
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const adminModel = app.get<Model<AdminUser>>(getModelToken(AdminUser.name));

  // SEED_RESET=1 → vacía toda la base antes de sembrar (deja prod limpio).
  if (process.env.SEED_RESET === '1') {
    const connection = app.get<Connection>(getConnectionToken());
    await connection.dropDatabase();
    console.log('🧹 Database dropped (SEED_RESET=1)');
  }

  // SEED_ADMIN_ONLY=1 → no crea las clínicas demo, solo el super-admin.
  const adminOnly = process.env.SEED_ADMIN_ONLY === '1';

  // Shared password for every seeded clinic OWNER.
  const sharedPassword = 'password123';
  const sharedHash = adminOnly ? '' : await argon2.hash(sharedPassword);

  for (const seed of adminOnly ? [] : SEED_CLINICS) {
    let clinic = await clinicModel.findOne({ slug: seed.slug }).exec();
    if (!clinic) {
      clinic = await clinicModel.create({
        name: seed.name,
        slug: seed.slug,
        doctorName: seed.doctorName,
        city: seed.city,
        phone: seed.phone,
        contactEmail: seed.contactEmail,
        brandColor: seed.brandColor,
        logoStyle: 'tooth',
        status: seed.status,
        subscriptionEndsAt: seed.daysToDue == null ? undefined : daysFromNow(seed.daysToDue),
        settings: {
          timezone: 'America/Argentina/Buenos_Aires',
          appointmentDurationDefault: 30,
          allowOverlappingAppointments: false,
          workingHours: [],
        },
      });
      console.log(`✅ Clinic seeded: ${seed.slug}`);
    } else {
      console.log(`ℹ️  Clinic exists: ${seed.slug}`);
    }

    // OWNER user: username = slug, synthetic email = `${slug}@molar.local`.
    const ownerEmail = `${seed.slug}@molar.local`;
    let owner = await userModel.findOne({ email: ownerEmail }).exec();
    if (!owner) {
      owner = await userModel.create({
        clinicId: clinic._id,
        name: seed.doctorName,
        email: ownerEmail,
        username: seed.slug,
        passwordHash: sharedHash,
        role: UserRole.OWNER,
        isClinical: true,
      });
      console.log(`   ↳ OWNER: ${seed.slug} / ${sharedPassword}`);
    }
  }

  // Admin user. Credentials are env-overridable so production can be seeded
  // with a strong password instead of the dev default.
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@soi.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  let admin = await adminModel.findOne({ email: adminEmail }).exec();
  if (!admin) {
    const passwordHash = await argon2.hash(adminPassword);
    admin = await adminModel.create({
      email: adminEmail,
      passwordHash,
      role: 'SUPERADMIN',
    });
    console.log(
      `✅ Admin user created: ${adminEmail} / ${process.env.SEED_ADMIN_PASSWORD ? '<from SEED_ADMIN_PASSWORD>' : 'admin123'}`,
    );
  } else {
    console.log('ℹ️  Admin user already exists');
  }

  console.log('\n📋 Credenciales:');
  console.log(`  Backoffice:  ${adminEmail}   /  ${process.env.SEED_ADMIN_PASSWORD ? '<tu clave>' : 'admin123'}`);
  if (!adminOnly) {
    console.log(`  Consultorio: <slug>          /  ${sharedPassword}`);
    console.log(`               (slugs: ${SEED_CLINICS.map(c => c.slug).join(', ')})`);
  }

  await app.close();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
