import {IsIn,IsUUID,Matches} from 'class-validator';
import {ApiProperty} from '@nestjs/swagger';
export class ThresholdQuery { @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string; }
export class CreateThresholdDto {
 @ApiProperty({format:'uuid'}) @IsUUID() siteId!:string;
 @ApiProperty({enum:['gift','donation']}) @IsIn(['gift','donation']) kind!:string;
 @ApiProperty({enum:['EUR','XOF','XAF','MAD','USD','GBP']}) @IsIn(['EUR','XOF','XAF','MAD','USD','GBP']) currency!:string;
 @ApiProperty() @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) amount!:string;
 @ApiProperty({format:'uuid'}) @IsUUID() idempotencyKey!:string;
}
