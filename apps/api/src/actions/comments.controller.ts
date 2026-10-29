import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from '../auth.js';
import { ActionCommentsService } from './comments.service.js';
import { ActionCommentQuery, CreateActionCommentDto } from './comments.dto.js';
@ApiTags('Action comments') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true})
@Controller('actions') @UseGuards(IdentityGuard)
export class ActionCommentsController {
  constructor(private readonly comments:ActionCommentsService) {}
  @Get(':id/comments') list(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Query() query:ActionCommentQuery) {return this.comments.list(req.principal,tenant,id,query);}
  @Post(':id/comments') create(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:CreateActionCommentDto) {return this.comments.create(req.principal,tenant,id,input);}
}
