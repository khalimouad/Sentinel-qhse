import {Transform,Type} from 'class-transformer';
import {IsDateString,IsIn,IsInt,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min,MinLength} from 'class-validator';
import {ApiProperty,ApiPropertyOptional,OmitType} from '@nestjs/swagger';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class ProcessQuery {
 @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() siteId?:string;
 @ApiPropertyOptional({enum:['active','archived']}) @IsIn(['active','archived']) status:'active'|'archived'='active';
 @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?:string;
 @ApiPropertyOptional({default:25}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
 @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
export class CreateProcessDto {
 @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() ownerId!:string;
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(50) code!:string;
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!:string;
 @ApiProperty({enum:['management','operational','support']}) @IsIn(['management','operational','support']) category!:string;
 @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) purpose?:string;
 @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) inputs?:string;
 @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) outputs?:string;
}
export class UpdateProcessDto extends OmitType(CreateProcessDto,['siteId','code'] as const) {
 @ApiProperty() @IsInt() @Min(1) revision!:number;
 @ApiProperty({enum:['active','archived']}) @IsIn(['active','archived']) status!:string;
}
export class ProcessLinkDto {
 @ApiProperty({enum:['risk','document']}) @IsIn(['risk','document']) kind!:'risk'|'document';
 @ApiProperty({format:'uuid'}) @IsUUID() targetId!:string;
}
export class ProcessLinkQuery {
 @ApiPropertyOptional({default:25}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
 @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
export class CreateIndicatorDto {
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!:string;
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(50) unit!:string;
 @ApiProperty() @Matches(/^-?\d{1,14}(?:\.\d{1,4})?$/) target!:string;
 @ApiProperty({enum:['at_least','at_most']}) @IsIn(['at_least','at_most']) direction!:string;
 @ApiProperty({enum:['monthly','quarterly','annual','other']}) @IsIn(['monthly','quarterly','annual','other']) frequency!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() ownerId!:string;
}
export class CreateMeasurementDto {
 @ApiProperty({format:'date'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) measuredOn!:string;
 @ApiProperty() @Matches(/^-?\d{1,14}(?:\.\d{1,4})?$/) value!:string;
 @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) note?:string;
}
