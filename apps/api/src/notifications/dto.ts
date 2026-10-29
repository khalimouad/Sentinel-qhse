import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class NotificationQuery {
  @ApiPropertyOptional({enum:['all','unread'],default:'all'}) @IsIn(['all','unread']) filter:'all'|'unread'='all';
  @ApiPropertyOptional({default:20,maximum:100}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
  @ApiPropertyOptional({default:0}) @Type(()=>Number) @IsInt() @Min(0) @Max(100000) offset=0;
}
export class ReadNotificationDto {
  @ApiProperty({enum:['read']}) @IsIn(['read']) status!:'read';
}
