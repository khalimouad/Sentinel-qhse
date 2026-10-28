import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class IssueAuditorQualificationDto {
  @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() userId!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) standard!:string;
  @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) validFrom!:string;
  @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) validUntil!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) evidenceReference!:string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) assessment!:string;
}
export class RevokeAuditorQualificationDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!:string;
}
export class AuditorQualificationQuery {
  @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) standard?:string;
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() userId?:string;
  @ApiPropertyOptional({default:20}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
  @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
