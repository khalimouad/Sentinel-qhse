import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from '../auth.js';
import { CreateEffectivenessDto, EffectivenessQuery } from './effectiveness.dto.js';
import { ActionsService } from './actions.service.js';
import { ActionExportQuery, ActionQuery, CreateActionDto, UpdateActionDto } from './dto.js';

@ApiTags('Actions') @ApiBearerAuth() @ApiHeader({ name: 'X-Tenant-Id', required: true })
@Controller('actions') @UseGuards(IdentityGuard)
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Headers('x-tenant-id') tenant: string | undefined, @Query() query: ActionQuery) {
    return this.actions.list(req.principal,tenant,query);
  }
  @Get('export') export(@Req() req: AuthenticatedRequest, @Headers('x-tenant-id') tenant: string | undefined, @Query() query: ActionExportQuery) {
    return this.actions.export(req.principal,tenant,query);
  }
  @Post() create(@Req() req: AuthenticatedRequest, @Headers('x-tenant-id') tenant: string | undefined, @Body() input: CreateActionDto) {
    return this.actions.create(req.principal,tenant,input);
  }
  @Patch(':id') update(@Req() req: AuthenticatedRequest, @Headers('x-tenant-id') tenant: string | undefined,
    @Param('id',new ParseUUIDPipe()) id: string, @Body() input: UpdateActionDto) {
    return this.actions.update(req.principal,tenant,id,input);
  }
  @Get(':id/effectiveness') effectiveness(@Req() req: AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Query() query:EffectivenessQuery) { return this.actions.effectiveness(req.principal,tenant,id,query); }
  @Post(':id/effectiveness') verifyEffectiveness(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:CreateEffectivenessDto) { return this.actions.verifyEffectiveness(req.principal,tenant,id,input); }
  @Get(':id/history') history(@Req() req: AuthenticatedRequest, @Headers('x-tenant-id') tenant: string | undefined,
    @Param('id',new ParseUUIDPipe()) id: string) {
    return this.actions.history(req.principal,tenant,id);
  }
}
