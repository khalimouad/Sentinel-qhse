import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class TemplateQuestionDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) clause!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) question!:string;
}
export class PublishAuditTemplateDto {
  @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
  @ApiProperty() @Transform(({value}:{value:unknown})=>typeof value==='string'?value.trim().toUpperCase():value) @Matches(/^[A-Z0-9][A-Z0-9_-]{1,39}$/) code!:string;
  @ApiProperty({minimum:0}) @IsInt() @Min(0) @Max(1000000) expectedVersion!:number;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) standard!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) changeNote!:string;
  @ApiProperty({type:[TemplateQuestionDto],minItems:1,maxItems:30}) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({each:true}) @Type(()=>TemplateQuestionDto) questions!:TemplateQuestionDto[];
}
export class AuditTemplateQuery {
  @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) standard?:string;
  @ApiPropertyOptional({default:50}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=50;
  @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
export class ApplyAuditTemplateDto {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty({format:'uuid'}) @IsUUID() templateId!:string;
  @ApiPropertyOptional({default:false}) @IsOptional() @IsBoolean() replace=false;
}
