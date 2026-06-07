import { IsEmail, MaxLength } from 'class-validator';

export class UpdateMyEmailDto {
  @IsEmail()
  @MaxLength(255)
  email: string;
}
