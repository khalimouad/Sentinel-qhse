import {Transform,Type} from 'class-transformer';
import {IsDateString,IsIn,IsInt,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min,MinLength} from 'class-validator';
import {ApiProperty,ApiPropertyOptional} from '@nestjs/swagger';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class EthicsQuery {
 @ApiProperty({enum:['third_party','assessment','gift','conflict']}) @IsIn(['third_party','assessment','gift','conflict']) kind!:string;
 @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() siteId?:string;
 @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?:string;
 @ApiPropertyOptional({default:25}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
 @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
export class CreateEthicsDto {
 @ApiProperty({enum:['third_party','assessment','gift','conflict']}) @IsIn(['third_party','assessment','gift','conflict']) kind!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() ownerId!:string;
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!:string;
 @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(6000) description?:string;
 @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) country?:string;
 @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() partyId?:string;
 @ApiPropertyOptional({enum:['unassessed','low','medium','high']}) @IsOptional() @IsIn(['unassessed','low','medium','high']) risk?:string;
 @ApiPropertyOptional() @IsOptional() @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) amount?:string;
 @ApiPropertyOptional({enum:['EUR','XOF','XAF','MAD','USD','GBP']}) @IsOptional() @IsIn(['EUR','XOF','XAF','MAD','USD','GBP']) currency?:string;
 @ApiPropertyOptional({format:'date'}) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) occurredOn?:string;
 @ApiPropertyOptional({format:'date'}) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) reviewOn?:string;
}
export class UpdateEthicsDto {
 @ApiProperty() @IsInt() @Min(1) revision!:number;
 @ApiProperty({enum:['open','reviewed','closed']}) @IsIn(['open','reviewed','closed']) status!:string;
 @ApiProperty({enum:['unassessed','low','medium','high']}) @IsIn(['unassessed','low','medium','high']) risk!:string;
 @ApiProperty() @Transform(trim) @IsString() @MaxLength(6000) description!:string;
 @ApiPropertyOptional({format:'date'}) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) reviewOn?:string;
}
