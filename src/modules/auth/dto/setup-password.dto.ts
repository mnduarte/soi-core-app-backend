import { IsString, MinLength } from 'class-validator';

// First-login flow: user arrives with mustChangePassword=true, enters
// the temp password from the WhatsApp invite + a new password (twice
// on the client; the server only sees the resolved newPassword).
export class SetupPasswordDto {
  @IsString()
  @MinLength(1)
  identifier: string;

  @IsString()
  @MinLength(6)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
