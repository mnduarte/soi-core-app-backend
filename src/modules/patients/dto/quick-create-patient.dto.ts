import { IsString } from 'class-validator';

// Crear un paciente rápido desde la agenda con solo un nombre (se splitea automáticamente).
export class QuickCreatePatientDto {
  @IsString()
  fullName: string;
}
