import { IsEmail, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { UserRole } from '../../users/schemas/user.schema';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsBoolean()
  isClinical?: boolean;
}
