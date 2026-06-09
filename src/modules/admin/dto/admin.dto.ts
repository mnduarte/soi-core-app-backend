import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum ClinicStatusUpdate {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class UpdateClinicSubscriptionDto {
  @IsOptional()
  @IsEnum(ClinicStatusUpdate)
  status?: ClinicStatusUpdate;

  @IsOptional()
  @IsDateString()
  subscriptionEndsAt?: string;
}

export class CreateBannerDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  ctaUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class CreateAdminInvitationDto {
  @IsEmail()
  email: string;

  @IsString()
  clinicId: string;
}

// Body for POST /admin/clinics — alta del consultorio desde backoffice.
// Genera Clinic + OWNER User en una sola operación.
export class CreateClinicAccountDto {
  @IsString()
  name: string;

  @IsString()
  doctorName: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  // Slug = username del OWNER. Si no se manda, lo derivamos del `name`.
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsHexColor()
  brandColor?: string;

  @IsOptional()
  @IsIn(['tooth', 'mono'])
  logoStyle?: 'tooth' | 'mono';
}

export class ExtendSubscriptionDto {
  @IsInt()
  @Min(1)
  days: number;
}

export class RecordPaymentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;
}

export class UpdateAdminSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  planPriceMonthly?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  trialDays?: number;
}
