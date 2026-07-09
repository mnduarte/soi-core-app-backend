import { IsDateString, IsMongoId, IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { AppointmentStatus, FichaStatus } from '../schemas/appointment.schema';

export class CreateAppointmentDto {
  // Uno de los dos es obligatorio (validado en el service): ficha vinculada o
  // nombre suelto tipo libreta.
  @IsOptional()
  @IsMongoId()
  patientId?: string;

  @IsOptional()
  @IsString()
  patientName?: string;

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

  // La libreta apila sobreturnos en el mismo horario: cuando el usuario confirma
  // el aviso, manda allowOverlap para saltear el chequeo de solapamiento.
  @IsOptional()
  @IsBoolean()
  allowOverlap?: boolean;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsMongoId()
  patientId?: string;

  @IsOptional()
  @IsString()
  patientName?: string;

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
