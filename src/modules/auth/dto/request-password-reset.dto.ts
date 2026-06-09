import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Public "olvidé mi contraseña" submission. The user types their identifier
// (username or email) and optionally a one-liner explaining what happened.
export class RequestPasswordResetDto {
  @IsString()
  @MinLength(1)
  identifier: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
