import { Body,Controller,Get,Headers,Param,ParseUUIDPipe,Patch,Post,Query,Req,UseGuards } from '@nestjs/common';
import { ApiBearerAuth,ApiHeader,ApiTags } from '@nestjs/swagger';
import { IdentityGuard,type AuthenticatedRequest } from '../auth.js';
import { ReportsService } from './reports.service.js';
import { AnalyzeReportDto,CreateReportDto,DecideReportDto,ReportActionDto,ReportExportQuery, ReportQuery } from './dto.js';

@ApiTags('Incidents et non-conformités') @ApiBearerAuth() @ApiHeader({ name:'X-Tenant-Id',required:true })
@Controller('reports') @UseGuards(IdentityGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get() list(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:ReportQuery){ return this.reports.list(req.principal,tenant,query); }
  @Get('export') export(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Query() query:ReportExportQuery){ return this.reports.export(req.principal,tenant,query); }
  @Post() create(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Body() input:CreateReportDto){ return this.reports.create(req.principal,tenant,input); }
  @Get(':id') detail(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){ return this.reports.detail(req.principal,tenant,id); }
  @Patch(':id/analysis') analyze(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:AnalyzeReportDto){ return this.reports.analyze(req.principal,tenant,id,input); }
  @Post(':id/decisions') decide(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:DecideReportDto){ return this.reports.decide(req.principal,tenant,id,input); }
  @Post(':id/actions') action(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ReportActionDto){ return this.reports.addAction(req.principal,tenant,id,input); }
  @Get(':id/history') history(@Req() req:AuthenticatedRequest,@Headers('x-tenant-id') tenant:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){ return this.reports.history(req.principal,tenant,id); }
}
