import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import type { AuditResult, AuditStatus, ReportCurrency, ReportSeverity } from '@sentinelle/contracts';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class CreateAuditDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) standard!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) scope!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() leadId!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() auditeeId!:string;
  @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) startsOn!:string;
  @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) endsOn!:string;
}
export class UpdateAuditPlanDto extends OmitType(CreateAuditDto,['siteId'] as const) {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!:string;
}
export class ChecklistItemDto {
  @ApiProperty({format:'uuid'}) @Transform(({value}:{value:unknown})=>typeof value==='string'?value.toLowerCase():value) @IsUUID() id!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) clause!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) question!:string;
  @ApiProperty({enum:['pending','conform','nonconform','not_applicable']}) @IsIn(['pending','conform','nonconform','not_applicable']) result!:AuditResult;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(1000) evidence!:string;
}
export class SaveChecklistDto {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty({type:[ChecklistItemDto],maxItems:30}) @IsArray() @ArrayMaxSize(30) @ArrayUnique((item:ChecklistItemDto)=>item.id) @ValidateNested({each:true}) @Type(()=>ChecklistItemDto) checklist!:ChecklistItemDto[];
}
export class DecideAuditDto {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty({enum:['start','complete','cancel']}) @IsIn(['start','complete','cancel']) command!:'start'|'complete'|'cancel';
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) conclusion?:string;
}
export class AuditFindingDto {
  @ApiProperty() @IsInt() @Min(1) revision!:number;
  @ApiProperty({format:'uuid'}) @IsUUID() itemId!:string;
  @ApiProperty({enum:['low','medium','high','critical']}) @IsIn(['low','medium','high','critical']) severity!:ReportSeverity;
  @ApiProperty({enum:['XOF','XAF','MAD','EUR','USD','GBP']}) @IsIn(['XOF','XAF','MAD','EUR','USD','GBP']) currency!:ReportCurrency;
}
export class AuditQuery {
  @ApiPropertyOptional({minimum:2000,maximum:2100}) @IsOptional() @Type(()=>Number) @IsInt() @Min(2000) @Max(2100) year?:number;
  @ApiPropertyOptional({minimum:1,maximum:12}) @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(12) month?:number;
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() siteId?:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?:string;
  @ApiPropertyOptional({enum:['planned','in_progress','completed','cancelled']}) @IsOptional() @IsIn(['planned','in_progress','completed','cancelled']) status?:AuditStatus;
  @ApiPropertyOptional({default:100}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=100;
  @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}

export class AuditProgrammeQuery extends OmitType(AuditQuery,['limit','offset','year','month'] as const) {
  @ApiProperty({minimum:2000,maximum:2100}) @Type(()=>Number) @IsInt() @Min(2000) @Max(2100) year!:number;
}
