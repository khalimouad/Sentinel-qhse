import { Controller, Get, Module } from '@nestjs/common';
import { readConfig } from './config.mjs';
import { CONFIG, IdentityGuard } from './auth.js';
import { Database } from './database.js';
import { WorkspaceController } from './workspace.controller.js';
import { ActionCommentsController } from './actions/comments.controller.js';
import { ActionCommentsService } from './actions/comments.service.js';
import { ActionsController } from './actions/actions.controller.js';
import { ActionsService } from './actions/actions.service.js';
import { DocumentsController } from './documents/documents.controller.js';
import { DocumentsService } from './documents/documents.service.js';
import { ReportsController } from './reports/reports.controller.js';
import { ReportsService } from './reports/reports.service.js';
import { AttachmentsController } from './attachments/attachments.controller.js';
import { AttachmentsService } from './attachments/attachments.service.js';
import { AuditsController } from './audits/audits.controller.js';
import { AuditsService } from './audits/audits.service.js';
import { AuditTemplatesController } from './audits/templates.controller.js';
import { AuditTemplatesService } from './audits/templates.service.js';
import { AuditorQualificationsController } from './audits/qualifications.controller.js';
import { AuditorQualificationsService } from './audits/qualifications.service.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { NotificationsService } from './notifications/notifications.service.js';
import { RisksController } from './risks/risks.controller.js';
import { RisksService } from './risks/risks.service.js';
import { OverviewController } from './overview/overview.controller.js';
import { OverviewService } from './overview/overview.service.js';
import { ObjectStorage } from './attachments/storage.js';

@Controller('health')
class HealthController {
  constructor(private readonly database: Database) {}
  @Get() healthy() { return this.database.healthy(); }
}
@Module({
  controllers: [HealthController,WorkspaceController,ActionsController,ActionCommentsController,DocumentsController,ReportsController,AttachmentsController,AuditsController,AuditTemplatesController,AuditorQualificationsController,NotificationsController,RisksController,OverviewController],
  providers: [{ provide: CONFIG, useFactory: () => readConfig() },Database,IdentityGuard,ActionsService,ActionCommentsService,DocumentsService,ReportsService,AttachmentsService,ObjectStorage,AuditsService,AuditTemplatesService,AuditorQualificationsService,NotificationsService,RisksService,OverviewService],
})
export class AppModule {}
