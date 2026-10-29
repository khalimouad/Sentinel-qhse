import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class CreateActionCommentDto {
  @ApiProperty({maxLength:4000})
  @Transform(({value}:{value:unknown})=>typeof value==='string'?value.trim():value)
  @IsString() @MinLength(1) @MaxLength(4000) @Matches(/^[^\u0000]*$/) body!:string;
  @ApiProperty({format:'uuid',description:'Reuse this key when retrying the same comment.'}) @IsUUID() idempotencyKey!:string;
}
export class ActionCommentQuery {
  @ApiPropertyOptional({default:20,maximum:100}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
  @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
