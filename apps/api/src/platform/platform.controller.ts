import { Body,Controller,Get,Param,ParseUUIDPipe,Post,Query,Req,UseGuards } from '@nestjs/common';
import { ApiBearerAuth,ApiTags } from '@nestjs/swagger';
import { IdentityGuard,type AuthenticatedRequest } from '../auth.js';
import { ReconcileInvitationDto,CancelPlatformInvitationDto,PlatformInvitationDto,PlatformAccountQuery,PlatformHistoryQuery,CompanyDto,CompanyMetadataDto,SiteMetadataDto,PlatformAccountDto,PlatformAccessDto,PlatformQuery,PlatformSiteDto } from './dto.js';
import { InvitationGatewayService } from './invitation-gateway.service.js';
import { PlatformService } from './platform.service.js';
@ApiTags('Platform administration') @ApiBearerAuth() @Controller('platform') @UseGuards(IdentityGuard)
export class PlatformController {
 constructor(private readonly platform:PlatformService,private readonly gateway:InvitationGatewayService){}
 @Get('context') context(@Req() req:AuthenticatedRequest){return this.platform.context(req.principal);}
 @Get('companies') list(@Req() req:AuthenticatedRequest,@Query() query:PlatformQuery){return this.platform.list(req.principal,query);}
 @Post('companies') company(@Req() req:AuthenticatedRequest,@Body() body:CompanyDto){return this.platform.company(req.principal,body);}
 @Get('companies/:id') detail(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string){return this.platform.detail(req.principal,id);}
 @Get('companies/:id/invitations') invitations(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PlatformQuery){return this.platform.invitations(req.principal,id,query);}
 @Post('companies/:id/invitations') requestInvitation(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:PlatformInvitationDto){return this.platform.requestInvitation(req.principal,id,body);}
 @Post('companies/:id/invitations/:invitationId/send') sendInvitation(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Param('invitationId',new ParseUUIDPipe()) invitationId:string){return this.gateway.send(req.principal,id,invitationId);}
 @Post('companies/:id/invitations/:invitationId/reconcile') reconcileInvitation(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Param('invitationId',new ParseUUIDPipe()) invitationId:string,@Body() body:ReconcileInvitationDto){return this.gateway.reconcile(req.principal,id,invitationId,body.subject,body.note);}
 @Post('companies/:id/invitations/:invitationId/cancel') cancelInvitation(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Param('invitationId',new ParseUUIDPipe()) invitationId:string,@Body() body:CancelPlatformInvitationDto){return this.platform.cancelInvitation(req.principal,id,invitationId,body);}
 @Get('companies/:id/accounts') accounts(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PlatformAccountQuery){return this.platform.accounts(req.principal,id,query);}
 @Get('companies/:id/history') history(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PlatformHistoryQuery){return this.platform.history(req.principal,id,query);}
 @Post('companies/:id/metadata') companyMetadata(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:CompanyMetadataDto){return this.platform.metadata(req.principal,id,null,body);}
 @Post('companies/:id/sites/:siteId/metadata') siteMetadata(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Param('siteId',new ParseUUIDPipe()) siteId:string,@Body() body:SiteMetadataDto){return this.platform.metadata(req.principal,id,siteId,body);}
 @Post('companies/:id/sites') site(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:PlatformSiteDto){return this.platform.site(req.principal,id,body);}
 @Post('companies/:id/accounts') account(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:PlatformAccountDto){return this.platform.account(req.principal,id,body);}
 @Post('companies/:id/access') access(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:PlatformAccessDto){return this.platform.access(req.principal,id,body);}
}
