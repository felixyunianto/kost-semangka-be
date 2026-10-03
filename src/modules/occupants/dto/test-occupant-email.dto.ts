import { IsEmail, IsOptional, IsString, IsTaxId, Max, MaxLength } from "class-validator";

export class TestOccupantEmailDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  propertyName?: string;
}