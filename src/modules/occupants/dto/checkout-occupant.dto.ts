import { IsDateString, IsOptional } from "class-validator";

export class CheckoutOccupantDto {
  @IsOptional()
  @IsDateString()
  checkOut?: string;
}
