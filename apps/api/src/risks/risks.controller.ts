import { Body,Controller,Get,Headers,Param,ParseUUIDPipe,Patch,Post,Query,Req,UseGuards } from '@nestjs/common';
import { ApiBearerAuth,ApiHeader,ApiTags } from '@nestjs/swagger';
import { IdentityGuard,type AuthenticatedRequest } from '../auth.js';
import { RisksService } from './risks.service.js';
import { AssessRiskDto,CreateRiskDto,DecideRiskDto,RiskActionDto,RiskQuery } from './dto.js';
@ApiTags('Risks') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true})
@Controller('risks') @UseGuards(IdentityGuard)
export class RisksController {
  constructor(private readonly risks:RisksService){}
  @Get() list(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:RiskQuery){return this.risks.list(req.principal,tenant,query);}
  @Post() create(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Body() input:CreateRiskDto){return this.risks.create(req.principal,tenant,input);}
  @Get(':id') detail(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.risks.detail(req.principal,tenant,id);}
  @Patch(':id/assessment') assess(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:AssessRiskDto){return this.risks.assess(req.principal,tenant,id,input);}
  @Post(':id/decisions') decide(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:DecideRiskDto){return this.risks.decide(req.principal,tenant,id,input);}
  @Post(':id/actions') action(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:RiskActionDto){return this.risks.addAction(req.principal,tenant,id,input);}
  @Get(':id/history') history(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.risks.history(req.principal,tenant,id);}
}
