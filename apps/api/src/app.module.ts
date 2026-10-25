import { Controller, Get, Module } from '@nestjs/common';
import { readConfig } from './config.mjs';
import { CONFIG, IdentityGuard } from './auth.js';
import { Database } from './database.js';
import { WorkspaceController } from './workspace.controller.js';
import { ActionsController } from './actions/actions.controller.js';
import { ActionsService } from './actions/actions.service.js';
import { DocumentsController } from './documents/documents.controller.js';
import { DocumentsService } from './documents/documents.service.js';

@Controller('health')
class HealthController {
  constructor(private readonly database: Database) {}
  @Get() healthy() { return this.database.healthy(); }
}
@Module({
  controllers: [HealthController,WorkspaceController,ActionsController,DocumentsController],
  providers: [{ provide: CONFIG, useFactory: () => readConfig() },Database,IdentityGuard,ActionsService,DocumentsService],
})
export class AppModule {}
