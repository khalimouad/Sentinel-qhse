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
      const {rows}=await session.db.query<{unread:number}>(`SELECT ((SELECT count(*) FROM app.notifications WHERE tenant_id=$1 AND recipient_id=$2 AND read_at IS NULL)+(SELECT count(*) FROM app.document_notifications WHERE tenant_id=$1 AND recipient_id=$2 AND read_at IS NULL)+(SELECT count(*) FROM app.document_reminders n WHERE n.tenant_id=$1 AND n.recipient_id=$2 AND n.read_at IS NULL AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=n.tenant_id AND v.id=n.version_id AND v.status='published') AND NOT EXISTS(SELECT 1 FROM app.document_distribution_cancellations c WHERE c.tenant_id=n.tenant_id AND c.version_id=n.version_id AND c.recipient_id=n.recipient_id) AND NOT EXISTS(SELECT 1 FROM app.document_receipts r WHERE r.tenant_id=n.tenant_id AND r.version_id=n.version_id AND r.user_id=n.recipient_id)))::int AS unread`,[session.tenant.id,session.actor.id]);
      return rows[0];
    });
  }
  list(principal:Principal,tenant:string|undefined,query:NotificationQuery):Promise<NotificationList> {
    return this.database.withTenant(principal,tenant,async session=>{
      const args=[session.tenant.id,session.actor.id,query.filter];
      const inbox=`WITH inbox AS (
        SELECT n.id,n.kind,n.action_id AS "actionId",a.title AS "actionTitle",NULL::uuid AS "documentId",NULL::text AS "documentTitle",a.report_id AS "reportId",a.risk_id AS "riskId",a.obligation_id AS "obligationId",n.actor_id AS "actorId",n.created_at AS "createdAt",n.read_at AS "readAt"
        FROM app.notifications n JOIN app.actions a ON a.tenant_id=n.tenant_id AND a.id=n.action_id WHERE n.tenant_id=$1 AND n.recipient_id=$2
        UNION ALL
        SELECT n.id,'document_assigned'::text,NULL::uuid,NULL::text,v.document_id,d.title,NULL::uuid,NULL::uuid,NULL::uuid,n.actor_id,n.created_at,n.read_at
        FROM app.document_notifications n JOIN app.document_versions v ON v.tenant_id=n.tenant_id AND v.id=n.version_id JOIN app.documents d ON d.tenant_id=v.tenant_id AND d.id=v.document_id WHERE n.tenant_id=$1 AND n.recipient_id=$2
        UNION ALL
        SELECT n.id,'document_reminder'::text,NULL::uuid,NULL::text,v.document_id,d.title,NULL::uuid,NULL::uuid,NULL::uuid,n.actor_id,n.created_at,n.read_at
        FROM app.document_reminders n JOIN app.document_versions v ON v.tenant_id=n.tenant_id AND v.id=n.version_id JOIN app.documents d ON d.tenant_id=v.tenant_id AND d.id=v.document_id
        WHERE n.tenant_id=$1 AND n.recipient_id=$2 AND v.status='published' AND NOT EXISTS(SELECT 1 FROM app.document_distribution_cancellations c WHERE c.tenant_id=n.tenant_id AND c.version_id=n.version_id AND c.recipient_id=n.recipient_id)
        AND NOT EXISTS(SELECT 1 FROM app.document_receipts r WHERE r.tenant_id=n.tenant_id AND r.version_id=n.version_id AND r.user_id=n.recipient_id)
      )`;
      const counts=await session.db.query<{total:number;unread:number}>(`${inbox} SELECT count(*) FILTER(WHERE $3::text='all' OR "readAt" IS NULL)::int AS total,count(*) FILTER(WHERE "readAt" IS NULL)::int AS unread FROM inbox`,args);
      const {rows}=await session.db.query<WorkspaceNotification>(`${inbox} SELECT i.*,coalesce(u.name,'Membre de l’organisation') AS "actorName" FROM inbox i LEFT JOIN identity.list_members($1) u ON u.id=i."actorId"
        WHERE ($3::text='all' OR i."readAt" IS NULL) ORDER BY i."createdAt" DESC,i.id DESC LIMIT $4 OFFSET $5`,[...args,query.limit,query.offset]);
      return {items:rows,...counts.rows[0]};
    });
  }
  read(principal:Principal,tenant:string|undefined,id:string):Promise<NotificationReceipt> {
    return this.database.withTenant(principal,tenant,async session=>{
      const updated=await session.db.query<NotificationReceipt>(`UPDATE app.notifications SET read_at=clock_timestamp()
        WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3 AND read_at IS NULL RETURNING id,read_at AS "readAt"`,[session.tenant.id,session.actor.id,id]);
      if(updated.rows[0])return updated.rows[0];
      const document=await session.db.query<NotificationReceipt>(`UPDATE app.document_notifications SET read_at=clock_timestamp() WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3 AND read_at IS NULL RETURNING id,read_at AS "readAt"`,[session.tenant.id,session.actor.id,id]);
      if(document.rows[0])return document.rows[0];
      const reminder=await session.db.query<NotificationReceipt>(`UPDATE app.document_reminders SET read_at=clock_timestamp() WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3 AND read_at IS NULL RETURNING id,read_at AS "readAt"`,[session.tenant.id,session.actor.id,id]);
      if(reminder.rows[0])return reminder.rows[0];
      const {rows}=await session.db.query<NotificationReceipt>(`SELECT id,read_at AS "readAt" FROM app.notifications WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3 UNION ALL SELECT id,read_at AS "readAt" FROM app.document_notifications WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3 UNION ALL SELECT n.id,n.read_at AS "readAt" FROM app.document_reminders n WHERE n.tenant_id=$1 AND n.recipient_id=$2 AND n.id=$3 AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=n.tenant_id AND v.id=n.version_id AND v.status='published') AND NOT EXISTS(SELECT 1 FROM app.document_distribution_cancellations c WHERE c.tenant_id=n.tenant_id AND c.version_id=n.version_id AND c.recipient_id=n.recipient_id) AND NOT EXISTS(SELECT 1 FROM app.document_receipts r WHERE r.tenant_id=n.tenant_id AND r.version_id=n.version_id AND r.user_id=n.recipient_id)`,[session.tenant.id,session.actor.id,id]);
      if(!rows[0])throw new NotFoundException('Notification introuvable.');
      return rows[0];
    });
  }
}
