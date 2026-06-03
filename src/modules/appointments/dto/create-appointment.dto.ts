import { IsDateString, IsMongoId, IsOptional, IsString, IsEnum } from 'class-validator';
import { AppointmentStatus, FichaStatus } from '../schemas/appointment.schema';

export class CreateAppointmentDto {
  @IsMongoId()
  patientId: string;

  @IsOptional()
  @IsMongoId()
  professionalId?: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsMongoId()
  professionalId?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsEnum(FichaStatus)
  ficha?: FichaStatus | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
