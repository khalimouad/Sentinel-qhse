import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import type { RiskCategory,RiskStatus,Priority } from '@sentinelle/contracts';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class CreateRiskDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(6000) description!:string;
  @ApiProperty({enum:['quality','safety','environment','compliance','governance','other']}) @IsIn(['quality','safety','environment','compliance','governance','other']) category!:RiskCategory;
  @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() ownerId!:string;
  @ApiProperty({minimum:1,maximum:5}) @IsInt() @Min(1) @Max(5) inherentLikelihood!:number;
  @ApiProperty({minimum:1,maximum:5}) @IsInt() @Min(1) @Max(5) inherentSeverity!:number;
  @ApiProperty({minimum:1,maximum:5}) @IsInt() @Min(1) @Max(5) residualLikelihood!:number;
  @ApiProperty({minimum:1,maximum:5}) @IsInt() @Min(1) @Max(5) residualSeverity!:number;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) controls!:string;
  @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) nextReviewOn!:string;
}
export class AssessRiskDto extends OmitType(CreateRiskDto,['siteId'] as const) {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) reason!:string;
}
export class DecideRiskDto {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty({enum:['accept','reopen','archive']}) @IsIn(['accept','reopen','archive']) command!:'accept'|'reopen'|'archive';
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) note!:string;
}
export class RiskActionDto {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) title!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() ownerId!:string;
  @ApiProperty({enum:['normal','high']}) @IsIn(['normal','high']) priority!:Priority;
  @ApiPropertyOptional({format:'date'}) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) dueDate?:string;
}
export class RiskQuery {
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() siteId?:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?:string;
  @ApiPropertyOptional({enum:['active','accepted','archived']}) @IsOptional() @IsIn(['active','accepted','archived']) status?:RiskStatus;
  @ApiPropertyOptional({enum:['quality','safety','environment','compliance','governance','other']}) @IsOptional() @IsIn(['quality','safety','environment','compliance','governance','other']) category?:RiskCategory;
  @ApiPropertyOptional({minimum:1,maximum:5}) @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(5) likelihood?:number;
  @ApiPropertyOptional({minimum:1,maximum:5}) @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(5) severity?:number;
  @ApiPropertyOptional({default:25}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
  @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}

export class RiskExportQuery extends OmitType(RiskQuery,['limit','offset'] as const) {}
