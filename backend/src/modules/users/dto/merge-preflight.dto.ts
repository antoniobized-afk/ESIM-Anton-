import { IsNotEmpty, IsString } from 'class-validator';

export class MergePreflightQueryDto {
  @IsString()
  @IsNotEmpty()
  sourceUserId: string;

  @IsString()
  @IsNotEmpty()
  targetUserId: string;
}
