import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ActionComment, ActionCommentList } from '@sentinelle/contracts';
import type { Principal } from '../auth.js';
import { Database, type TenantSession } from '../database.js';
import { ActionCommentQuery, CreateActionCommentDto } from './comments.dto.js';
const columns=`c.id,c.action_id AS "actionId",c.author_id AS "authorId",u.name AS "authorName",c.body,c.created_at AS "createdAt"`;
const joins='FROM app.action_comments c JOIN identity.list_members($1) u ON u.id=c.author_id';
@Injectable()
export class ActionCommentsService {
  constructor(private readonly database:Database) {}
  private async action(session:TenantSession,id:string):Promise<{site_id:string}> {
    const {rows}=await session.db.query<{site_id:string}>('SELECT site_id FROM app.actions WHERE tenant_id=$1 AND id=$2',[session.tenant.id,id]);
    if(!rows[0])throw new NotFoundException('Action introuvable.');
    return rows[0];
  }
  list(principal:Principal,tenant:string|undefined,id:string,query:ActionCommentQuery):Promise<ActionCommentList> {
    return this.database.withTenant(principal,tenant,async session=>{
      await this.action(session,id);
      const args=[session.tenant.id,id];
      const count=await session.db.query('SELECT count(*)::int AS total FROM app.action_comments WHERE tenant_id=$1 AND action_id=$2',args);
      const {rows}=await session.db.query<ActionComment>(`SELECT ${columns} ${joins} WHERE c.tenant_id=$1 AND c.action_id=$2 ORDER BY c.created_at DESC,c.id DESC LIMIT $3 OFFSET $4`,[...args,query.limit,query.offset]);
      return {items:rows,total:count.rows[0].total};
    });
  }
  create(principal:Principal,tenant:string|undefined,id:string,input:CreateActionCommentDto):Promise<ActionComment> {
    return this.database.withTenant(principal,tenant,async session=>{
      if(!session.canWrite)throw new ForbiddenException('Seuls les responsables habilités peuvent ajouter un commentaire de suivi.');
      const action=await this.action(session,id);
      // Retries append at most once for this author/action/key; no UPDATE grant is needed.
      await session.db.query(`INSERT INTO app.action_comments(id,tenant_id,site_id,action_id,author_id,body,request_key)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,action_id,author_id,request_key) DO NOTHING`,
        [randomUUID(),session.tenant.id,action.site_id,id,session.actor.id,input.body,input.idempotencyKey]);
      const {rows}=await session.db.query<ActionComment>(`SELECT ${columns} ${joins} WHERE c.tenant_id=$1 AND c.action_id=$2 AND c.author_id=$3 AND c.request_key=$4`,
        [session.tenant.id,id,session.actor.id,input.idempotencyKey]);
      if(!rows[0]||rows[0].body!==input.body)throw new ConflictException('Cette clé d’envoi correspond déjà à un autre commentaire. Utilisez une nouvelle clé pour un nouveau contenu.');
      return rows[0];
    });
  }
}
