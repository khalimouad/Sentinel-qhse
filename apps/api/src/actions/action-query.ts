export const actionColumns = `a.id,a.title,a.origin,a.site_id AS "siteId",s.name AS "siteName",a.owner_id AS "ownerId",
  u.name AS "ownerName",a.priority,a.status,to_char(a.due_date,'YYYY-MM-DD') AS "dueDate",a.version,
  a.report_id AS "reportId",a.risk_id AS "riskId",a.obligation_id AS "obligationId",a.created_at AS "createdAt",a.updated_at AS "updatedAt"`;
export const actionJoins = 'FROM app.actions a JOIN app.sites s ON s.id=a.site_id JOIN identity.list_members($1) u ON u.id=a.owner_id';
