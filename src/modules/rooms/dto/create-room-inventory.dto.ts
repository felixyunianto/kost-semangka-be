import { InventoryCondition, InventoryStatus } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateRoomInventoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEnum(InventoryCondition)
  condition!: InventoryCondition;

  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;
}
