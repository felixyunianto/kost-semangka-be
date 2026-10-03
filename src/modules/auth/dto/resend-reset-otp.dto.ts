import { IsNotEmpty, IsString } from "class-validator";

export class ResendResetOtpDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;
}
