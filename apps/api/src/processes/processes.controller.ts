import {Body,Controller,Get,Headers,Param,ParseUUIDPipe,Patch,Post,Query,Req,UseGuards} from '@nestjs/common';
import {ApiBearerAuth,ApiHeader,ApiTags} from '@nestjs/swagger';
import {IdentityGuard,type AuthenticatedRequest} from '../auth.js';
import {CreateIndicatorDto,CreateMeasurementDto,CreateProcessDto,ProcessLinkDto,ProcessLinkQuery,ProcessQuery,UpdateProcessDto} from './dto.js';
import {ProcessesService} from './processes.service.js';
@ApiTags('Processus') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true}) @Controller('processes') @UseGuards(IdentityGuard)
export class ProcessesController {
 constructor(private readonly service:ProcessesService){}
 @Get() list(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Query() q:ProcessQuery){return this.service.list(r.principal,t,q);}
 @Post() create(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Body() b:CreateProcessDto){return this.service.create(r.principal,t,b);}
 @Get(':id') detail(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.service.detail(r.principal,t,id);}
 @Patch(':id') update(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() b:UpdateProcessDto){return this.service.update(r.principal,t,id,b);}
 @Get(':id/links') links(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Query() q:ProcessLinkQuery){return this.service.links(r.principal,t,id,q);}
 @Post(':id/links') addLink(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() b:ProcessLinkDto){return this.service.addLink(r.principal,t,id,b);}
 @Get(':id/indicators') indicators(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Query() q:ProcessLinkQuery){return this.service.indicators(r.principal,t,id,q);}
 @Post(':id/indicators') addIndicator(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() b:CreateIndicatorDto){return this.service.addIndicator(r.principal,t,id,b);}
 @Get(':id/indicators/:indicatorId/measurements') measurements(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Param('indicatorId',new ParseUUIDPipe()) indicatorId:string,@Query() q:ProcessLinkQuery){return this.service.measurements(r.principal,t,id,indicatorId,q);}
 @Post(':id/indicators/:indicatorId/measurements') addMeasurement(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Param('indicatorId',new ParseUUIDPipe()) indicatorId:string,@Body() b:CreateMeasurementDto){return this.service.addMeasurement(r.principal,t,id,indicatorId,b);}
 @Get(':id/history') history(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.service.history(r.principal,t,id);}
}
