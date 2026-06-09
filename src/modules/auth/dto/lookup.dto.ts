import { IsString, MinLength } from 'class-validator';

// Public endpoint used by the two-step login UI. Step 1 sends the
// identifier (username or email); the response decides what step 2
// should look like (greeting + password vs. create-your-password).
export class LookupDto {
  @IsString()
  @MinLength(1)
  identifier: string;
}
