import { IsOptional, IsString } from 'class-validator';

// Login accepts either email or username. `identifier` is the canonical field
// for new clients; `email` is kept as an alias so older `core-app-frontend`
// builds that still send `{ email, password }` keep working untouched.
export class LoginDto {
  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsString()
  email?: string;

  // No length rule here on purpose: at login any wrong/short password should
  // just come back as "Credenciales inválidas", not a validation error.
  @IsString()
  password: string;
}
