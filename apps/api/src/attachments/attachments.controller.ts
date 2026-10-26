import { Body,Controller,Get,Headers,Param,ParseUUIDPipe,Post,Query,Req,UseGuards } from '@nestjs/common';
import { ApiBearerAuth,ApiHeader,ApiTags } from '@nestjs/swagger';
import { IdentityGuard,type AuthenticatedRequest } from '../auth.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentParentDto,RemoveAttachmentDto,UploadAttachmentDto } from './dto.js';
@ApiTags('Pièces jointes') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true})
@Controller('attachments') @UseGuards(IdentityGuard)
export class AttachmentsController{
  constructor(private readonly attachments:AttachmentsService){}
  @Get()list(@Req()req:AuthenticatedRequest,@Headers('x-tenant-id')tenant:string|undefined,@Query()input:AttachmentParentDto){return this.attachments.list(req.principal,tenant,input);}
  @Post('uploads')start(@Req()req:AuthenticatedRequest,@Headers('x-tenant-id')tenant:string|undefined,@Body()input:UploadAttachmentDto){return this.attachments.start(req.principal,tenant,input);}
  @Post(':id/confirm')confirm(@Req()req:AuthenticatedRequest,@Headers('x-tenant-id')tenant:string|undefined,@Param('id',new ParseUUIDPipe())id:string){return this.attachments.confirm(req.principal,tenant,id);}
  @Post(':id/remove')remove(@Req()req:AuthenticatedRequest,@Headers('x-tenant-id')tenant:string|undefined,@Param('id',new ParseUUIDPipe())id:string,@Body()input:RemoveAttachmentDto){return this.attachments.remove(req.principal,tenant,id,input);}
  @Get(':id/download')download(@Req()req:AuthenticatedRequest,@Headers('x-tenant-id')tenant:string|undefined,@Param('id',new ParseUUIDPipe())id:string){return this.attachments.download(req.principal,tenant,id);}
  @Get(':id/history')history(@Req()req:AuthenticatedRequest,@Headers('x-tenant-id')tenant:string|undefined,@Param('id',new ParseUUIDPipe())id:string){return this.attachments.history(req.principal,tenant,id);}
}
