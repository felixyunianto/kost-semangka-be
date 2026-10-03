import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class FilterFinanceReportDto {
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
