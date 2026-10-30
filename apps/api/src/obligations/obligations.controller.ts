import { Body,Controller,Get,Headers,Param,ParseUUIDPipe,Post,Query,Req,UseGuards } from '@nestjs/common';
import { ApiBearerAuth,ApiHeader,ApiTags } from '@nestjs/swagger';
import { IdentityGuard,type AuthenticatedRequest } from '../auth.js';
import { ObligationsService } from './obligations.service.js';
import { AssessObligationDto,CreateObligationDto,ObligationActionDto,ObligationActionQuery,ObligationDecisionDto,ObligationExportQuery,ObligationQuery } from './dto.js';
@ApiTags('Obligations') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true})
@Controller('obligations') @UseGuards(IdentityGuard)
export class ObligationsController {
  constructor(private readonly obligations:ObligationsService){}
  @Get() list(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:ObligationQuery){return this.obligations.list(req.principal,tenant,query);}
  @Get('export') export(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:ObligationExportQuery){return this.obligations.export(req.principal,tenant,query);}
  @Post() create(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Body() input:CreateObligationDto){return this.obligations.create(req.principal,tenant,input);}
  @Get(':id') detail(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.obligations.detail(req.principal,tenant,id);}
  @Post(':id/decisions') decide(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ObligationDecisionDto){return this.obligations.decide(req.principal,tenant,id,input);}
  @Post(':id/assessments') assess(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:AssessObligationDto){return this.obligations.assess(req.principal,tenant,id,input);}
  @Get(':id/actions') actions(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Query() query:ObligationActionQuery){return this.obligations.actions(req.principal,tenant,id,query);}
  @Post(':id/actions') addAction(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ObligationActionDto){return this.obligations.addAction(req.principal,tenant,id,input);}
  @Get(':id/history') history(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.obligations.history(req.principal,tenant,id);}
}
