import { IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
