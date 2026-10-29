import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationList,NotificationReceipt,WorkspaceNotification } from '@sentinelle/contracts';
import type { Principal } from '../auth.js';
import { Database } from '../database.js';
import { NotificationQuery } from './dto.js';
@Injectable()
export class NotificationsService {
  constructor(private readonly database:Database) {}
  unread(principal:Principal,tenant:string|undefined):Promise<{unread:number}> {
    return this.database.withTenant(principal,tenant,async session=>{
      const {rows}=await session.db.query<{unread:number}>('SELECT count(*)::int AS unread FROM app.notifications WHERE tenant_id=$1 AND recipient_id=$2 AND read_at IS NULL',[session.tenant.id,session.actor.id]);
      return rows[0];
    });
  }
  list(principal:Principal,tenant:string|undefined,query:NotificationQuery):Promise<NotificationList> {
    return this.database.withTenant(principal,tenant,async session=>{
      const args=[session.tenant.id,session.actor.id,query.filter];
      const counts=await session.db.query<{total:number;unread:number}>(`SELECT count(*) FILTER(WHERE $3::text='all' OR read_at IS NULL)::int AS total,
        count(*) FILTER(WHERE read_at IS NULL)::int AS unread FROM app.notifications WHERE tenant_id=$1 AND recipient_id=$2`,args);
      const {rows}=await session.db.query<WorkspaceNotification>(`SELECT n.id,n.kind,n.action_id AS "actionId",a.title AS "actionTitle",a.report_id AS "reportId",
        n.actor_id AS "actorId",coalesce(u.name,'Membre de l’organisation') AS "actorName",n.created_at AS "createdAt",n.read_at AS "readAt"
        FROM app.notifications n JOIN app.actions a ON a.tenant_id=n.tenant_id AND a.id=n.action_id
        LEFT JOIN identity.list_members($1) u ON u.id=n.actor_id
        WHERE n.tenant_id=$1 AND n.recipient_id=$2 AND ($3::text='all' OR n.read_at IS NULL)
        ORDER BY n.created_at DESC,n.id DESC LIMIT $4 OFFSET $5`,[...args,query.limit,query.offset]);
      return {items:rows,...counts.rows[0]};
    });
  }
  read(principal:Principal,tenant:string|undefined,id:string):Promise<NotificationReceipt> {
    return this.database.withTenant(principal,tenant,async session=>{
      const updated=await session.db.query<NotificationReceipt>(`UPDATE app.notifications SET read_at=clock_timestamp()
        WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3 AND read_at IS NULL RETURNING id,read_at AS "readAt"`,[session.tenant.id,session.actor.id,id]);
      if(updated.rows[0])return updated.rows[0];
      const {rows}=await session.db.query<NotificationReceipt>('SELECT id,read_at AS "readAt" FROM app.notifications WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3',[session.tenant.id,session.actor.id,id]);
      if(!rows[0])throw new NotFoundException('Notification introuvable.');
      return rows[0];
    });
  }
}
