import { Transform,Type } from 'class-transformer';
import { IsDateString,IsIn,IsInt,IsOptional,IsString,IsUrl,IsUUID,Matches,Max,MaxLength,Min,MinLength } from 'class-validator';
import { ApiProperty,ApiPropertyOptional,OmitType } from '@nestjs/swagger';
import type { ObligationAssessmentStatus } from '@sentinelle/contracts';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class CreateObligationDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() ownerId!:string;
  @ApiProperty() @Transform(({value}:{value:unknown})=>typeof value==='string'?value.trim().toUpperCase():value) @Matches(/^[A-Z][A-Z0-9_-]{1,19}$/) jurisdiction!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) sourceTitle!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) sourceVersion!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) article!:string;
  @ApiProperty({format:'uri'}) @Transform(trim) @IsUrl({protocols:['https'],require_protocol:true,disallow_auth:true}) @MaxLength(2000) sourceUrl!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(8000) excerpt!:string;
  @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) nextReviewOn!:string;
}
export class ObligationDecisionDto {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty({enum:['verify_source','archive','reopen']}) @IsIn(['verify_source','archive','reopen']) command!:'verify_source'|'archive'|'reopen';
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) note!:string;
}
export class AssessObligationDto {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty({enum:['compliant','partial','noncompliant','not_applicable']}) @IsIn(['compliant','partial','noncompliant','not_applicable']) status!:Exclude<ObligationAssessmentStatus,'not_assessed'>;
  @ApiProperty({format:'uuid'}) @IsUUID() ownerId!:string;
  @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) nextReviewOn!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) note!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) evidenceReference!:string;
}
export class ObligationQuery {
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() siteId?:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?:string;
  @ApiPropertyOptional({enum:['active','archived']}) @IsIn(['active','archived']) lifecycle:'active'|'archived'='active';
  @ApiPropertyOptional({enum:['not_assessed','compliant','partial','noncompliant','not_applicable']}) @IsOptional() @IsIn(['not_assessed','compliant','partial','noncompliant','not_applicable']) status?:ObligationAssessmentStatus;
  @ApiPropertyOptional({default:25}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
  @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}

export class ObligationActionDto {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) title!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() ownerId!:string;
  @ApiProperty({enum:['normal','high']}) @IsIn(['normal','high']) priority!:'normal'|'high';
  @ApiPropertyOptional({format:'date'}) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) dueDate?:string;
}
export class ObligationActionQuery {
  @ApiPropertyOptional({default:25}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
  @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}

export class ObligationExportQuery extends OmitType(ObligationQuery,['limit','offset'] as const) {}
