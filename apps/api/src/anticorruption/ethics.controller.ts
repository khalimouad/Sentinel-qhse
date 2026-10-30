import {Body,Controller,Get,Headers,Param,ParseUUIDPipe,Patch,Post,Query,Req,UseGuards} from '@nestjs/common';
import {ApiBearerAuth,ApiHeader,ApiTags} from '@nestjs/swagger';
import {IdentityGuard,type AuthenticatedRequest} from '../auth.js';
import {CreateEthicsDto,EthicsQuery,UpdateEthicsDto,EthicsDecisionDto,EthicsSummaryQuery} from './dto.js';
import {CreateThresholdDto,ThresholdQuery} from './threshold.dto.js';
import {ControlTestQuery,CreateControlTestDto,CompleteControlTestDto,ControlTestActionDto} from './control-tests.dto.js';
import {EthicsService} from './ethics.service.js';
@ApiTags('Anticorruption') @ApiBearerAuth() @ApiHeader({name:'X-Tenant-Id',required:true}) @Controller('ethics') @UseGuards(IdentityGuard)
export class EthicsController {
 constructor(private readonly service:EthicsService){}
 @Get() list(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Query() q:EthicsQuery){return this.service.list(r.principal,t,q);}
 @Get('summary') summary(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Query() q:EthicsSummaryQuery){return this.service.summary(r.principal,t,q);}
 @Get('thresholds') thresholds(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Query() q:ThresholdQuery){return this.service.thresholds(r.principal,t,q);}
 @Post('thresholds') createThreshold(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Body() b:CreateThresholdDto){return this.service.createThreshold(r.principal,t,b);}
 @Post() create(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Body() b:CreateEthicsDto){return this.service.create(r.principal,t,b);}
 @Patch(':id') update(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() b:UpdateEthicsDto){return this.service.update(r.principal,t,id,b);}
 @Post(':id/decision') decide(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() b:EthicsDecisionDto){return this.service.decide(r.principal,t,id,b);}
 @Get(':id/tests') tests(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Query() q:ControlTestQuery){return this.service.tests(r.principal,t,id,q);}
 @Post(':id/tests') planTest(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() b:CreateControlTestDto){return this.service.planTest(r.principal,t,id,b);}
 @Post(':id/tests/:testId/complete') completeTest(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Param('testId',new ParseUUIDPipe()) testId:string,@Body() b:CompleteControlTestDto){return this.service.completeTest(r.principal,t,id,testId,b);}
 @Get(':id/tests/:testId/actions') testActions(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Param('testId',new ParseUUIDPipe()) testId:string,@Query() q:ControlTestQuery){return this.service.testActions(r.principal,t,id,testId,q);}
 @Post(':id/tests/:testId/actions') addTestAction(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Param('testId',new ParseUUIDPipe()) testId:string,@Body() b:ControlTestActionDto){return this.service.addTestAction(r.principal,t,id,testId,b);}
 @Get(':id/history') history(@Req() r:AuthenticatedRequest,@Headers('x-tenant-id') t:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.service.history(r.principal,t,id);}
}
