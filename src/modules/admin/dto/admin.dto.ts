import { IsString, IsOptional, IsEnum, IsEmail, IsBoolean, IsDateString } from 'class-validator';

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
