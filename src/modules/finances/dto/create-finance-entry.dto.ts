import { FinanceCategory } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";

export class CreateFinanceEntryDto {
  @IsUUID()
  propertyId!: string;

  @IsEnum(FinanceCategory)
  category!: FinanceCategory;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  occurredAt!: string;

  @IsString()
  @MaxLength(255)
  description!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
