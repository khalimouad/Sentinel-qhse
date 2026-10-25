import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Priority, ReportCommand, ReportCurrency, ReportKind, ReportSeverity, ReportStatus } from '@sentinelle/contracts';
const trim=({ value }: { value: unknown })=>typeof value==='string' ? value.trim() : value;
export class CreateReportDto {
  @ApiProperty({ maxLength:300 }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @ApiProperty({ maxLength:10000 }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(10000) description!: string;
  @ApiProperty({ enum:['incident','near_miss','nonconformity','complaint'] }) @IsIn(['incident','near_miss','nonconformity','complaint']) kind!: ReportKind;
  @ApiProperty({ enum:['low','medium','high','critical'] }) @IsIn(['low','medium','high','critical']) severity!: ReportSeverity;
  @ApiProperty({ format:'uuid' }) @IsUUID() siteId!: string;
  @ApiProperty({ format:'date-time' }) @IsDateString({ strict:true }) occurredAt!: string;
  @ApiPropertyOptional({ maxLength:4000 }) @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) correction?: string;
  @ApiProperty({ enum:['XOF','XAF','MAD','EUR','USD','GBP'] }) @IsIn(['XOF','XAF','MAD','EUR','USD','GBP']) currency!: ReportCurrency;
}
export class AnalyzeReportDto {
  @ApiProperty() @IsInt() @Min(1) revision!: number;
  @ApiProperty({ format:'uuid' }) @IsUUID() ownerId!: string;
  @ApiProperty({ format:'uuid' }) @IsUUID() verifierId!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(4000) correction!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(4000) rootCause!: string;
  @ApiProperty({ type:[String],maxItems:5 }) @IsArray() @ArrayMaxSize(5)
  @Transform(({ value }: { value: unknown })=>Array.isArray(value) ? value.map(v=>typeof v==='string' ? v.trim() : v) : value)
  @IsString({ each:true }) @MinLength(1,{ each:true }) @MaxLength(1000,{ each:true }) fiveWhys!: string[];
  @ApiProperty({ example:'15000.00' }) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) costAmount!: string;
  @ApiProperty({ enum:['XOF','XAF','MAD','EUR','USD','GBP'] }) @IsIn(['XOF','XAF','MAD','EUR','USD','GBP']) currency!: ReportCurrency;
}
export class DecideReportDto {
  @ApiProperty() @IsInt() @Min(1) revision!: number;
  @ApiProperty({ enum:['start_analysis','plan_actions','request_review','close','return_for_action','reopen'] })
  @IsIn(['start_analysis','plan_actions','request_review','close','return_for_action','reopen']) command!: ReportCommand;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) note?: string;
}
export class ReportActionDto {
  @ApiProperty() @IsInt() @Min(1) revision!: number;
  @ApiProperty({ maxLength:500 }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) title!: string;
  @ApiProperty({ format:'uuid' }) @IsUUID() ownerId!: string;
  @ApiProperty({ enum:['normal','high'] }) @IsIn(['normal','high']) priority!: Priority;
  @ApiPropertyOptional({ format:'date' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict:true }) dueDate?: string;
}
export class ReportQuery {
  @ApiPropertyOptional({ format:'uuid' }) @IsOptional() @IsUUID() siteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({ enum:['reported','in_analysis','action_plan','effectiveness_review','closed'] }) @IsOptional() @IsIn(['reported','in_analysis','action_plan','effectiveness_review','closed']) status?: ReportStatus;
  @ApiPropertyOptional({ default:100 }) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=100;
  @ApiPropertyOptional({ default:0 }) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
