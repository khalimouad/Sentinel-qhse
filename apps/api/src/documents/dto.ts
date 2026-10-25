import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DocumentCommand } from '@sentinelle/contracts';
export class VersionInput {
  @ApiProperty({ maxLength: 15000 }) @IsString() @MinLength(1) @MaxLength(15000)
  @Transform(({ value }: { value: unknown }) => typeof value==='string' ? value.trim() : value) content!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() reviewerId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() approverId!: string;
}
export class CreateDocumentDto extends VersionInput {
  @ApiProperty() @Matches(/^[A-Z0-9][A-Z0-9._-]{0,49}$/) code!: string;
  @ApiProperty({ maxLength: 200 }) @IsString() @MinLength(1) @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => typeof value==='string' ? value.trim() : value) title!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() siteId!: string;
}
export class NewVersionDto extends VersionInput { @ApiProperty() @IsInt() @Min(1) expectedLastVersion!: number; }
export class EditVersionDto {
  @ApiProperty() @IsInt() @Min(1) revision!: number;
  @ApiProperty({ maxLength: 15000 }) @IsString() @MinLength(1) @MaxLength(15000)
  @Transform(({ value }: { value: unknown }) => typeof value==='string' ? value.trim() : value) content!: string;
}
export class DecideVersionDto {
  @ApiProperty() @IsInt() @Min(1) revision!: number;
  @ApiProperty({ enum: ['submit','verify','approve','reject'] }) @IsIn(['submit','verify','approve','reject']) command!: DocumentCommand;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
export class DocumentQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() siteId?: string;
  @ApiPropertyOptional({ default: 100 }) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=100;
  @ApiPropertyOptional({ default: 0 }) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
