import {Transform,Type} from 'class-transformer';
import {IsDateString,IsIn,IsInt,IsString,IsUUID,Matches,Max,MaxLength,Min,MinLength} from 'class-validator';
import {ApiProperty,ApiPropertyOptional} from '@nestjs/swagger';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class ControlTestQuery {
 @ApiPropertyOptional({default:25}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
 @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
export class CreateControlTestDto {
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!:string;
 @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) plannedOn!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() testerId!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() idempotencyKey!:string;
}
export class CompleteControlTestDto {
 @ApiProperty() @IsInt() @Min(1) revision!:number;
 @ApiProperty({enum:['effective','ineffective','partial']}) @IsIn(['effective','ineffective','partial']) result!:string;
 @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) testedOn!:string;
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) evidenceReference!:string;
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) conclusion!:string;
}
