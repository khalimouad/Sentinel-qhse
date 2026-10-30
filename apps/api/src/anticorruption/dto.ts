import {Transform,Type} from 'class-transformer';
import {IsDateString,IsIn,IsInt,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min,MinLength,ValidateNested} from 'class-validator';
import {ApiProperty,ApiPropertyOptional} from '@nestjs/swagger';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class EthicsQuery {
 @ApiProperty({enum:['third_party','assessment','gift','conflict','donation','control']}) @IsIn(['third_party','assessment','gift','conflict','donation','control']) kind!:string;
 @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() siteId?:string;
 @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?:string;
 @ApiPropertyOptional({default:25}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=25;
 @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
export class CreateEthicsDto {
 @ApiProperty({enum:['third_party','assessment','gift','conflict','donation','control']}) @IsIn(['third_party','assessment','gift','conflict','donation','control']) kind!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() ownerId!:string;
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!:string;
 @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(6000) description?:string;
 @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) country?:string;
 @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() partyId?:string;
 @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() riskId?:string;
 @ApiPropertyOptional({enum:['unassessed','low','medium','high']}) @IsOptional() @IsIn(['unassessed','low','medium','high']) risk?:string;
 @ApiPropertyOptional() @IsOptional() @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) amount?:string;
 @ApiPropertyOptional({enum:['EUR','XOF','XAF','MAD','USD','GBP']}) @IsOptional() @IsIn(['EUR','XOF','XAF','MAD','USD','GBP']) currency?:string;
 @ApiPropertyOptional({format:'date'}) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) occurredOn?:string;
 @ApiPropertyOptional({format:'date'}) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) reviewOn?:string;
}
export class EthicsQuestionnaireDto {
 @ApiPropertyOptional({enum:['yes','no','unknown']}) @IsOptional() @IsIn(['yes','no','unknown']) ownership_known?:string;
 @ApiPropertyOptional({enum:['yes','no','unknown']}) @IsOptional() @IsIn(['yes','no','unknown']) public_official_link?:string;
 @ApiPropertyOptional({enum:['yes','no','unknown']}) @IsOptional() @IsIn(['yes','no','unknown']) anticorruption_policy?:string;
 @ApiPropertyOptional({enum:['yes','no','unknown']}) @IsOptional() @IsIn(['yes','no','unknown']) adverse_history?:string;
 @ApiPropertyOptional({enum:['yes','no','unknown']}) @IsOptional() @IsIn(['yes','no','unknown']) intermediary_use?:string;
}
export class UpdateEthicsDto {
 @ApiPropertyOptional({type:EthicsQuestionnaireDto}) @IsOptional() @ValidateNested() @Type(()=>EthicsQuestionnaireDto) questionnaire?:EthicsQuestionnaireDto;
 @ApiProperty() @IsInt() @Min(1) revision!:number;
 @ApiProperty({enum:['open','reviewed','closed']}) @IsIn(['open','reviewed','closed']) status!:string;
 @ApiProperty({enum:['unassessed','low','medium','high']}) @IsIn(['unassessed','low','medium','high']) risk!:string;
 @ApiProperty() @Transform(trim) @IsString() @MaxLength(6000) description!:string;
 @ApiPropertyOptional({format:'date'}) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) reviewOn?:string;
}

export class EthicsDecisionDto {
 @ApiProperty() @IsInt() @Min(1) revision!:number;
 @ApiProperty({enum:['approve','reject','conditional']}) @IsIn(['approve','reject','conditional']) decision!:string;
 @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) note!:string;
}
