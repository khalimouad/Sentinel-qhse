import { Controller, Get, Headers, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Actor, MeResponse, Site, TenantSummary, WorkspaceContext } from '@sentinelle/contracts';
import { Database } from './database.js';
import { IdentityGuard, type AuthenticatedRequest } from './auth.js';

@ApiTags('Workspace') @ApiBearerAuth() @Controller() @UseGuards(IdentityGuard)
export class WorkspaceController {
  constructor(private readonly database: Database) {}
  @Get('me') me(@Req() req: AuthenticatedRequest): Promise<MeResponse> {
    return this.database.withIdentity(req.principal, async ({ db, actor }) => {
      const { rows } = await db.query<TenantSummary>('SELECT id,name,region,jurisdictions,identity.current_role(id) AS role FROM app.tenants ORDER BY name,id');
      return { actor, tenants: rows, authentication: req.principal.authentication };
    });
  }
  @Get('context') @ApiHeader({ name: 'X-Tenant-Id', required: true })
  context(@Req() req: AuthenticatedRequest, @Headers('x-tenant-id') tenant: string | undefined): Promise<WorkspaceContext> {
    return this.database.withTenant(req.principal,tenant,async ({ db,actor,tenant: scope,canWrite }) => {
      const sites = await db.query<Site>('SELECT id,name,country_code AS "countryCode" FROM app.sites WHERE tenant_id=$1 ORDER BY name,id', [scope.id]);
      const members = await db.query<Actor>('SELECT * FROM identity.list_members($1)', [scope.id]);
      const eligible = await db.query<Actor & { siteId: string }>(`SELECT s.id AS "siteId",m.id,m.name
        FROM app.sites s CROSS JOIN identity.list_members($1) m WHERE s.tenant_id=$1 AND identity.can_review_site($1,s.id,m.id) ORDER BY m.name`,[scope.id]);
      const documentReviewers: Record<string,Actor[]> = {};
      for (const member of eligible.rows) (documentReviewers[member.siteId] ||= []).push({ id:member.id,name:member.name });
      return { actor, tenant: scope, sites: sites.rows, members: members.rows, canWrite,documentReviewers };
    });
  }
}
