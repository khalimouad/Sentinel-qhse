import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IdentityGuard,type AuthenticatedRequest } from '../auth.js';
import { NotificationQuery,ReadNotificationDto } from './dto.js';
import { NotificationsService } from './notifications.service.js';
@ApiTags('Notifications') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true})
@Controller('notifications') @UseGuards(IdentityGuard)
export class NotificationsController {
  constructor(private readonly notifications:NotificationsService) {}
  @Get() list(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:NotificationQuery) {return this.notifications.list(req.principal,tenant,query);}
  @Get('unread-count') unread(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined) {return this.notifications.unread(req.principal,tenant);}
  @Post(':id/read') read(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() _input:ReadNotificationDto) {return this.notifications.read(req.principal,tenant,id);}
}
