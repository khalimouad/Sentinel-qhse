import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityGuard, type AuthenticatedRequest } from '../auth.js';
import { AuditorQualificationsService } from './qualifications.service.js';
import { AuditorQualificationQuery, IssueAuditorQualificationDto, RevokeAuditorQualificationDto } from './qualifications.dto.js';
@ApiTags('Auditor qualifications') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true})
@Controller('auditor-qualifications') @UseGuards(IdentityGuard)
export class AuditorQualificationsController {
  constructor(private readonly qualifications:AuditorQualificationsService) {}
  @Get() list(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:AuditorQualificationQuery) {return this.qualifications.list(req.principal,tenant,query);}
  @Post() issue(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Body() input:IssueAuditorQualificationDto) {return this.qualifications.issue(req.principal,tenant,input);}
  @Post(':id/revocations') revoke(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:RevokeAuditorQualificationDto) {return this.qualifications.revoke(req.principal,tenant,id,input);}
}
