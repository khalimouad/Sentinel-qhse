import { Injectable,NotFoundException } from '@nestjs/common';
import type { OverviewSummary } from '@sentinelle/contracts';
import type { Principal } from '../auth.js';
import { Database } from '../database.js';
import { actionColumns } from '../actions/action-query.js';
import { OverviewQuery } from './dto.js';
@Injectable()
export class OverviewService {
  constructor(private readonly database:Database){}
  summary(principal:Principal,tenant:string|undefined,query:OverviewQuery):Promise<OverviewSummary>{
    return this.database.withTenant(principal,tenant,async session=>{
      if(query.siteId){
        const exists=await session.db.query('SELECT id FROM app.sites WHERE tenant_id=$1 AND id=$2',[session.tenant.id,query.siteId]);
        if(!exists.rowCount)throw new NotFoundException('Site introuvable dans votre périmètre.');
      }
      // Every relation retains its own FORCE RLS policy. All counts and the six
      // suggested actions are read in one SQL statement, without list pagination.
      const {rows}=await session.db.query<OverviewSummary>(`WITH today AS (
        SELECT (statement_timestamp() AT TIME ZONE 'UTC')::date AS day
      ), scoped_actions AS (
        SELECT a.* FROM app.actions a WHERE a.tenant_id=$1 AND ($2::uuid IS NULL OR a.site_id=$2)
      ), next_actions AS (
        SELECT a.*,row_number() OVER(ORDER BY CASE WHEN a.due_date<today.day THEN 0 ELSE 1 END,
          CASE WHEN a.priority='high' THEN 0 ELSE 1 END,a.due_date ASC NULLS LAST,a.created_at DESC,a.id) AS rank
        FROM scoped_actions a CROSS JOIN today WHERE a.status='open'
        ORDER BY rank LIMIT 6
      ), published AS (
        SELECT v.id FROM app.document_versions v WHERE v.tenant_id=$1 AND ($2::uuid IS NULL OR v.site_id=$2) AND v.status='published'
      ), scoped_reports AS (
        SELECT r.status,r.severity FROM app.reports r WHERE r.tenant_id=$1 AND ($2::uuid IS NULL OR r.site_id=$2)
      ), scoped_audits AS (
        SELECT a.status,a.starts_on,a.ends_on FROM app.audits a WHERE $3::boolean AND a.tenant_id=$1 AND ($2::uuid IS NULL OR a.site_id=$2)
      ), scoped_risks AS (
        SELECT r.residual_score,r.next_review_on FROM app.risks r WHERE $3::boolean AND r.tenant_id=$1
          AND ($2::uuid IS NULL OR r.site_id=$2) AND r.status<>'archived'
      ) SELECT statement_timestamp() AS "asOf",(SELECT day::text FROM today) AS "asOfDate",
        (SELECT count(*)::int FROM app.sites WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id=$2)) AS "siteCount",
        (SELECT jsonb_build_object('total',count(*)::int,'open',count(*) FILTER(WHERE a.status='open')::int,
          'closed',count(*) FILTER(WHERE a.status='closed')::int,
          'overdue',count(*) FILTER(WHERE a.status='open' AND a.due_date<today.day)::int,
          'dueSoon',count(*) FILTER(WHERE a.status='open' AND a.due_date>=today.day AND a.due_date<today.day+30)::int,
          'owners',count(DISTINCT a.owner_id) FILTER(WHERE a.status='open')::int) FROM scoped_actions a CROSS JOIN today) AS actions,
        (SELECT jsonb_build_object('published',count(*)::int,'unread',count(*) FILTER(WHERE NOT EXISTS(
          SELECT 1 FROM app.document_receipts receipt WHERE receipt.tenant_id=$1 AND receipt.version_id=p.id AND receipt.user_id=identity.actor_id()))::int)
          FROM published p) AS documents,
        (SELECT jsonb_build_object('open',count(*) FILTER(WHERE r.status<>'closed')::int,
          'criticalOpen',count(*) FILTER(WHERE r.status<>'closed' AND r.severity='critical')::int) FROM scoped_reports r) AS reports,
        CASE WHEN $3::boolean THEN (SELECT jsonb_build_object('planned',count(*) FILTER(WHERE a.status='planned')::int,
          'inProgress',count(*) FILTER(WHERE a.status='in_progress')::int,
          'overdue',count(*) FILTER(WHERE (a.status='planned' AND a.starts_on<today.day) OR (a.status='in_progress' AND a.ends_on<today.day))::int)
          FROM scoped_audits a CROSS JOIN today) ELSE NULL END AS audits,
        CASE WHEN $3::boolean THEN (SELECT jsonb_build_object('tracked',count(*)::int,
          'critical',count(*) FILTER(WHERE r.residual_score>=17)::int,
          'high',count(*) FILTER(WHERE r.residual_score BETWEEN 10 AND 16)::int,
          'moderate',count(*) FILTER(WHERE r.residual_score BETWEEN 5 AND 9)::int,
          'low',count(*) FILTER(WHERE r.residual_score<=4)::int,
          'reviewOverdue',count(*) FILTER(WHERE r.next_review_on<today.day)::int)
          FROM scoped_risks r CROSS JOIN today) ELSE NULL END AS risks,
        (SELECT count(*)::int FROM app.notifications n WHERE n.tenant_id=$1 AND n.recipient_id=identity.actor_id()
          AND ($2::uuid IS NULL OR n.site_id=$2) AND n.read_at IS NULL) AS "notificationUnread",
        (SELECT coalesce(jsonb_agg(to_jsonb(item)-'rank' ORDER BY item.rank),'[]'::jsonb) FROM (
          SELECT ${actionColumns},a.rank FROM next_actions a JOIN app.sites s ON s.id=a.site_id
          JOIN identity.list_members($1) u ON u.id=a.owner_id
        ) item) AS "nextActions"`,[session.tenant.id,query.siteId||null,session.canWrite]);
      return rows[0];
    });
  }
}
