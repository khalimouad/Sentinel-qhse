import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from '../auth.js';
import { AuditTemplateQuery, PublishAuditTemplateDto } from './templates.dto.js';
import { AuditTemplatesService } from './templates.service.js';
@ApiTags('Audit templates') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true})
@Controller('audit-templates') @UseGuards(IdentityGuard)
export class AuditTemplatesController {
  constructor(private readonly templates:AuditTemplatesService) {}
  @Get() list(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:AuditTemplateQuery) {return this.templates.list(req.principal,tenant,query);}
  @Post() publish(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Body() input:PublishAuditTemplateDto) {return this.templates.publish(req.principal,tenant,input);}
  @Get(':id/versions') versions(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string) {return this.templates.versions(req.principal,tenant,id);}
}
