import { PaymentGateway, PaymentStatus } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

import { PaginationQueryDto } from "src/common/dto/pagination-query.dto";

export class FilterPaymentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentGateway)
  gateway?: PaymentGateway;

  @IsOptional()
  @IsUUID()
  billId?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  occupantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  occupantName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  paidFrom?: string;

  @IsOptional()
  @IsDateString()
  paidTo?: string;
}
