import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ActionStatus, Priority } from '@sentinelle/contracts';

export class CreateActionDto {
  @ApiProperty({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(500) title!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() siteId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() ownerId!: string;
  @ApiProperty({ enum: ['normal','high'] }) @IsIn(['normal','high']) priority!: Priority;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dueDate?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(200) origin?: string;
}
export class UpdateActionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: ['open','closed'] }) @IsIn(['open','closed']) status!: ActionStatus;
}
export class ActionQuery {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() siteId?: string;
  @ApiPropertyOptional({ enum: ['open','closed'] }) @IsOptional() @IsIn(['open','closed']) status?: ActionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({ default: 100, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 100;
  @ApiPropertyOptional({ default: 0 }) @Type(() => Number) @IsInt() @Min(0) @Max(100000) offset = 0;
}

// Export filters match the register but deliberately do not accept pagination.
export class ActionExportQuery {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() siteId?: string;
  @ApiPropertyOptional({ enum: ['open','closed'] }) @IsOptional() @IsIn(['open','closed']) status?: ActionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
}
