import { IsOptional, IsUUID } from "class-validator";

export class FilterDashboardDto {
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}
