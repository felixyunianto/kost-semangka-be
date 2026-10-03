import { IsDateString, IsNumber, IsString, IsUUID, Min } from "class-validator";

export class CreateBillDto {
  @IsUUID()
  occupantId!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsDateString()
  dueDate!: string;

  @IsString()
  description!: string;
}
