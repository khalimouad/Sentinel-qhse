import { Transform,Type } from 'class-transformer';
import { IsIn,IsInt,IsString,IsUUID,Matches,Max,MaxLength,Min,MinLength } from 'class-validator';
import { ApiProperty,ApiPropertyOptional } from '@nestjs/swagger';
export class CreateEffectivenessDto {
 @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
 @ApiProperty({enum:['effective','ineffective']}) @IsIn(['effective','ineffective']) result!:'effective'|'ineffective';
 @ApiProperty({maxLength:4000}) @Transform(({value}:{value:unknown})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(1) @MaxLength(4000) @Matches(/^[^\u0000]*$/) evidence!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() idempotencyKey!:string;
}
export class EffectivenessQuery {
 @ApiPropertyOptional({default:20}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
 @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
