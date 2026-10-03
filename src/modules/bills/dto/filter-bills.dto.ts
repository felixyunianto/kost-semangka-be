import { BillStatus, BillType } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

import { PaginationQueryDto } from "src/common/dto/pagination-query.dto";

export class FilterBillsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  occupantName?: string;

  @IsOptional()
  @IsUUID()
  occupantId?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsEnum(BillStatus)
  status?: BillStatus;

  @IsOptional()
  @IsEnum(BillType)
  type?: BillType;

  @IsOptional()
  @IsDateString()
  dueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  dueDateTo?: string;
}
