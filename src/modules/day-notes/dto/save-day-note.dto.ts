import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class PriorityDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class SaveDayNoteDto {
  // 'YYYY-MM-DD'
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (YYYY-MM-DD)' })
  day: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriorityDto)
  priorities?: PriorityDto[];
}
