import { InventoryCondition, InventoryStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateRoomInventoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(InventoryCondition)
  condition?: InventoryCondition;

  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;
}
