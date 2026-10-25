import { BadRequestException, ForbiddenException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { isUUID } from 'class-validator';
import pg from 'pg';
import type { Actor, TenantSummary } from '@sentinelle/contracts';
import { CONFIG, type Config, type Principal } from './auth.js';

interface Session { db: pg.PoolClient; actor: Actor }
export interface TenantSession extends Session { tenant: TenantSummary; canWrite: boolean }
@Injectable()
export class Database implements OnModuleInit, OnModuleDestroy {
  private readonly pool: pg.Pool;
  constructor(@Inject(CONFIG) config: Config) {
    this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
    this.pool.on('error', () => console.error('An idle database connection failed.'));
  }
  async onModuleInit() {
    const { rows } = await this.pool.query(`SELECT current_user AS name, rolsuper, rolbypassrls,
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('app','identity') AND pg_has_role(current_user,n.nspowner,'MEMBER')) AS owner_member
      FROM pg_roles WHERE rolname = current_user`);
    if (!rows[0] || rows[0].name !== 'sentinelle_app' || rows[0].rolsuper || rows[0].rolbypassrls || rows[0].owner_member) {
      throw new Error('The API requires the restricted sentinelle_app role without SUPERUSER or BYPASSRLS.');
    }
  }
  async onModuleDestroy() { await this.pool.end(); }
  async healthy() { await this.pool.query('SELECT 1'); return { status: 'ok' }; }
  async withIdentity<T>(principal: Principal, operation: (session: Session) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SET LOCAL statement_timeout = '15s'");
      await db.query("SET LOCAL lock_timeout = '5s'");
      await db.query("SELECT set_config('app.actor_id','',true), set_config('app.tenant_id','',true)");
      const { rows } = await db.query<Actor>('SELECT * FROM identity.resolve_actor($1,$2)', [principal.issuer,principal.subject]);
      const actor = rows[0];
      if (!actor) throw new ForbiddenException('This identity has not been provisioned.');
      await db.query("SELECT set_config('app.actor_id',$1,true)", [actor.id]);
      const result = await operation({ db, actor });
      await db.query('COMMIT');
      return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  async withTenant<T>(principal: Principal, tenantId: string | undefined, operation: (session: TenantSession) => Promise<T>) {
    if (!tenantId || !isUUID(tenantId)) throw new BadRequestException('A UUID X-Tenant-Id header is required.');
    return this.withIdentity(principal, async ({ db, actor }) => {
      await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const { rows } = await db.query<TenantSummary>(
        'SELECT id,name,region,jurisdictions,identity.current_role(id) AS role FROM app.tenants WHERE id=$1', [tenantId]);
      if (!rows[0]) throw new ForbiddenException('This organization is not accessible.');
      return operation({ db, actor, tenant: rows[0], canWrite: ['admin','manager'].includes(rows[0].role) });
    });
  }
}
