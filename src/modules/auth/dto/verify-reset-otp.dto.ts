import { IS_LENGTH, IsNotEmpty, IsString, Length } from "class-validator";

export class VerifyResetOtpDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;
}
