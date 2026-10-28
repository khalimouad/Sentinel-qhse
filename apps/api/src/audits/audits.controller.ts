import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from '../auth.js';
import { ApplyAuditTemplateDto } from './templates.dto.js';
import { AuditsService } from './audits.service.js';
import { AuditFindingDto, AuditProgrammeQuery, AuditQuery, CreateAuditDto, DecideAuditDto, SaveChecklistDto, UpdateAuditPlanDto } from './dto.js';
@ApiTags('Audits') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true})
@Controller('audits') @UseGuards(IdentityGuard)
export class AuditsController {
  constructor(private readonly audits:AuditsService) {}
  @Get() list(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:AuditQuery) { return this.audits.list(req.principal,tenant,query); }
  @Post() create(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Body() input:CreateAuditDto) { return this.audits.create(req.principal,tenant,input); }
  @Get('programme') programme(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:AuditProgrammeQuery) {return this.audits.programme(req.principal,tenant,query);}
  @Get(':id') detail(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string) { return this.audits.detail(req.principal,tenant,id); }
  @Patch(':id/plan') replan(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:UpdateAuditPlanDto) { return this.audits.replan(req.principal,tenant,id,input); }
  @Patch(':id/checklist') checklist(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:SaveChecklistDto) { return this.audits.checklist(req.principal,tenant,id,input); }
  @Post(':id/template') applyTemplate(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ApplyAuditTemplateDto) {return this.audits.applyTemplate(req.principal,tenant,id,input);}
  @Post(':id/decisions') decide(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:DecideAuditDto) { return this.audits.decide(req.principal,tenant,id,input); }
  @Post(':id/findings') finding(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:AuditFindingDto) { return this.audits.finding(req.principal,tenant,id,input); }
  @Get(':id/history') history(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string) { return this.audits.history(req.principal,tenant,id); }
}
