import { IsOptional,IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
export class OverviewQuery {
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() siteId?:string;
}
