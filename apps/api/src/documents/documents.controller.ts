import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from '../auth.js';
import { DocumentsService } from './documents.service.js';
import { CreateDocumentDto, DecideVersionDto, DocumentQuery, EditVersionDto, NewVersionDto } from './dto.js';

@ApiTags('Documents') @ApiBearerAuth() @ApiHeader({ name: 'X-Tenant-Id',required: true })
@Controller('documents') @UseGuards(IdentityGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Get() list(@Req() req: AuthenticatedRequest,@Headers('x-tenant-id') tenant: string|undefined,@Query() query: DocumentQuery) { return this.documents.list(req.principal,tenant,query); }
  @Post() create(@Req() req: AuthenticatedRequest,@Headers('x-tenant-id') tenant: string|undefined,@Body() input: CreateDocumentDto) { return this.documents.create(req.principal,tenant,input); }
  @Get(':id') detail(@Req() req: AuthenticatedRequest,@Headers('x-tenant-id') tenant: string|undefined,@Param('id',new ParseUUIDPipe()) id: string) { return this.documents.detail(req.principal,tenant,id); }
  @Post(':id/versions') version(@Req() req: AuthenticatedRequest,@Headers('x-tenant-id') tenant: string|undefined,@Param('id',new ParseUUIDPipe()) id: string,@Body() input: NewVersionDto) { return this.documents.newVersion(req.principal,tenant,id,input); }
  @Patch(':id/versions/:versionId') edit(@Req() req: AuthenticatedRequest,@Headers('x-tenant-id') tenant: string|undefined,@Param('id',new ParseUUIDPipe()) id: string,@Param('versionId',new ParseUUIDPipe()) version: string,@Body() input: EditVersionDto) { return this.documents.edit(req.principal,tenant,id,version,input); }
  @Post(':id/versions/:versionId/decisions') decide(@Req() req: AuthenticatedRequest,@Headers('x-tenant-id') tenant: string|undefined,@Param('id',new ParseUUIDPipe()) id: string,@Param('versionId',new ParseUUIDPipe()) version: string,@Body() input: DecideVersionDto) { return this.documents.decide(req.principal,tenant,id,version,input); }
  @Post(':id/versions/:versionId/acknowledgements') acknowledge(@Req() req: AuthenticatedRequest,@Headers('x-tenant-id') tenant: string|undefined,@Param('id',new ParseUUIDPipe()) id: string,@Param('versionId',new ParseUUIDPipe()) version: string) { return this.documents.acknowledge(req.principal,tenant,id,version); }
  @Get(':id/history') history(@Req() req: AuthenticatedRequest,@Headers('x-tenant-id') tenant: string|undefined,@Param('id',new ParseUUIDPipe()) id: string) { return this.documents.history(req.principal,tenant,id); }
}
