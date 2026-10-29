import { Controller,Get,Headers,Query,Req,UseGuards } from '@nestjs/common';
import { ApiBearerAuth,ApiHeader,ApiTags } from '@nestjs/swagger';
import { IdentityGuard,type AuthenticatedRequest } from '../auth.js';
import { OverviewService } from './overview.service.js';
import { OverviewQuery } from './dto.js';
@ApiTags('Overview') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true})
@Controller('overview') @UseGuards(IdentityGuard)
export class OverviewController {
  constructor(private readonly overview:OverviewService){}
  @Get() summary(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:OverviewQuery){return this.overview.summary(req.principal,tenant,query);}
}
