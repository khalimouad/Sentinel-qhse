import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Action, ActionList, AuditEvent } from '@sentinelle/contracts';
import { Database, type TenantSession } from '../database.js';
import type { Principal } from '../auth.js';
import { ActionQuery, CreateActionDto, UpdateActionDto } from './dto.js';

const columns = `a.id,a.title,a.origin,a.site_id AS "siteId",s.name AS "siteName",a.owner_id AS "ownerId",
  u.name AS "ownerName",a.priority,a.status,to_char(a.due_date,'YYYY-MM-DD') AS "dueDate",a.version,
  a.created_at AS "createdAt",a.updated_at AS "updatedAt"`;
const joins = 'FROM app.actions a JOIN app.sites s ON s.id=a.site_id JOIN identity.list_members($1) u ON u.id=a.owner_id';

@Injectable()
export class ActionsService {
  constructor(private readonly database: Database) {}
  private requireWrite(session: TenantSession) {
    if (!session.canWrite) throw new ForbiddenException('This role has read-only access.');
  }
  async list(principal: Principal, tenant: string | undefined, query: ActionQuery): Promise<ActionList> {
    return this.database.withTenant(principal, tenant, async ({ db, tenant: scope }) => {
      const conditions = `WHERE a.tenant_id=$1 AND ($2::uuid IS NULL OR a.site_id=$2) AND ($3::text IS NULL OR a.status=$3)
        AND ($4::text='' OR strpos(lower(a.title),lower($4))>0)`;
      const params = [scope.id, query.siteId || null, query.status || null, query.search || ''];
      const count = await db.query(`SELECT count(*)::integer AS total FROM app.actions a ${conditions}`, params);
      const { rows } = await db.query<Action>(`SELECT ${columns} ${joins} ${conditions} ORDER BY a.created_at DESC,a.id LIMIT $5 OFFSET $6`, [...params, query.limit, query.offset]);
      return { items: rows, total: count.rows[0].total };
    });
  }
  async create(principal: Principal, tenant: string | undefined, input: CreateActionDto): Promise<Action> {
    return this.database.withTenant(principal, tenant, async session => {
      this.requireWrite(session);
      const { db, tenant: scope } = session;
      const allowed = await db.query('SELECT identity.can_assign_site($1,$2,$3) AS allowed', [scope.id,input.siteId,input.ownerId]);
      if (!allowed.rows[0].allowed) throw new BadRequestException('The site or assignee is unavailable in this scope.');
      const id = randomUUID();
      await db.query(`INSERT INTO app.actions(id,tenant_id,title,site_id,owner_id,priority,origin,due_date)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id,scope.id,input.title,input.siteId,input.ownerId,input.priority,input.origin || 'Saisie manuelle',input.dueDate || null]);
      const { rows } = await db.query<Action>(`SELECT ${columns} ${joins} WHERE a.tenant_id=$1 AND a.id=$2`, [scope.id,id]);
      return rows[0];
    });
  }
  async update(principal: Principal, tenant: string | undefined, id: string, input: UpdateActionDto): Promise<Action> {
    return this.database.withTenant(principal, tenant, async session => {
      this.requireWrite(session);
      const { db, tenant: scope } = session;
      const updated = await db.query(`UPDATE app.actions SET status=$3,version=version+1,updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND id=$2 AND version=$4 RETURNING id`, [scope.id,id,input.status,input.version]);
      if (!updated.rowCount) {
        const exists = await db.query('SELECT id FROM app.actions WHERE tenant_id=$1 AND id=$2', [scope.id,id]);
        if (!exists.rowCount) throw new NotFoundException('Action not found.');
        throw new ConflictException('The action was changed by another user. Reload before retrying.');
      }
      const { rows } = await db.query<Action>(`SELECT ${columns} ${joins} WHERE a.tenant_id=$1 AND a.id=$2`, [scope.id,id]);
      return rows[0];
    });
  }
  async history(principal: Principal, tenant: string | undefined, id: string): Promise<AuditEvent[]> {
    return this.database.withTenant(principal, tenant, async ({ db, tenant: scope }) => {
      const exists = await db.query('SELECT id FROM app.actions WHERE tenant_id=$1 AND id=$2', [scope.id,id]);
      if (!exists.rowCount) throw new NotFoundException('Action not found.');
      const { rows } = await db.query<AuditEvent>(`SELECT id, action_id AS "actionId", actor_id AS "actorId",operation,
        occurred_at AS "occurredAt",before_data AS "before",after_data AS "after"
        FROM app.audit_events WHERE tenant_id=$1 AND action_id=$2 ORDER BY occurred_at DESC,id LIMIT 100`, [scope.id,id]);
      return rows;
    });
  }
}
