import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { User, UserRole } from './modules/users/schemas/user.schema';
import { Clinic, SubscriptionStatus } from './modules/clinics/schemas/clinic.schema';
import { AdminUser } from './modules/admin-auth/schemas/admin-user.schema';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const clinicModel = app.get<Model<Clinic>>(getModelToken(Clinic.name));
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const adminModel = app.get<Model<AdminUser>>(getModelToken(AdminUser.name));

  // Clinic
  let clinic = await clinicModel.findOne({ slug: 'demo-clinic' }).exec();
  if (!clinic) {
    clinic = await clinicModel.create({
      name: 'Clínica Demo',
      slug: 'demo-clinic',
      status: SubscriptionStatus.ACTIVE,
      subscriptionEndsAt: new Date('2027-01-01'),
      settings: {
        timezone: 'America/Argentina/Buenos_Aires',
        appointmentDurationDefault: 30,
        allowOverlappingAppointments: false,
        workingHours: [],
      },
    });
    console.log('✅ Clinic created:', clinic._id.toString());
  } else {
    console.log('ℹ️  Clinic already exists:', clinic._id.toString());
  }

  // Owner user
  const ownerEmail = 'owner';
  let owner = await userModel.findOne({ email: ownerEmail }).exec();
  if (!owner) {
    const passwordHash = await argon2.hash('password123');
    owner = await userModel.create({
      clinicId: clinic._id,
      name: 'Dr. Demo',
      email: ownerEmail,
      passwordHash,
      role: UserRole.OWNER,
      isClinical: true,
    });
    console.log('✅ Owner user created:', ownerEmail, '/ password123');
  } else {
    console.log('ℹ️  Owner user already exists');
  }

  // Admin user
  const adminEmail = 'admin';
  let admin = await adminModel.findOne({ email: adminEmail }).exec();
  if (!admin) {
    const passwordHash = await argon2.hash('admin123');
    admin = await adminModel.create({
      email: adminEmail,
      passwordHash,
      role: 'SUPERADMIN',
    });
    console.log('✅ Admin user created:', adminEmail, '/ admin123');
  } else {
    console.log('ℹ️  Admin user already exists');
  }

  console.log('\n📋 Credenciales:');
  console.log('  App:         owner  /  password123  →  http://localhost:5173');
  console.log('  Backoffice:  admin   /  admin123     →  http://localhost:5174');

  await app.close();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
