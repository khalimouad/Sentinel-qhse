export type Role = 'admin' | 'manager' | 'reader';
export type Priority = 'normal' | 'high';
export type ActionStatus = 'open' | 'closed';
export interface TenantSummary { id: string; name: string; region: string; jurisdictions: string[]; role: Role }
export interface Actor { id: string; name: string }
export interface Site { id: string; name: string; countryCode: string }
export interface WorkspaceContext {
  actor: Actor; tenant: TenantSummary; sites: Site[]; members: Actor[]; canWrite: boolean;
  documentReviewers: Record<string,Actor[]>;
}
export interface MeResponse { actor: Actor; tenants: TenantSummary[]; authentication: 'oidc' | 'development' }
export interface Action {
  id: string; title: string; origin: string; siteId: string; siteName: string;
  ownerId: string; ownerName: string; priority: Priority; status: ActionStatus;
  dueDate: string | null; version: number; createdAt: string; updatedAt: string;
  reportId: string | null; riskId:string|null; obligationId:string|null;
}
export interface ActionList { items: Action[]; total: number }
export interface CreateAction {
  title: string; siteId: string; ownerId: string; priority: Priority; dueDate?: string; origin?: string;
}
export interface UpdateAction { version: number; status: ActionStatus }
export interface AuditEvent {
  id: string; actionId: string; actorId: string; operation: 'INSERT' | 'UPDATE';
  occurredAt: string; before: Record<string, unknown> | null; after: Record<string, unknown>;
}
export type DocumentStatus = 'draft' | 'in_review' | 'pending_approval' | 'published' | 'rejected' | 'archived';
export type DocumentCommand = 'submit' | 'verify' | 'approve' | 'reject';
export interface DocumentSummary {
  id: string; code: string; title: string; siteId: string; siteName: string;
  lastVersion: number; status: DocumentStatus; updatedAt: string;
}
export interface DocumentVersion {
  id: string; number: number; content: string; contentSha256: string; status: DocumentStatus;
  authorId: string; reviewerId: string; approverId: string; revision: number;
  reviewedAt: string | null; approvedAt: string | null; decisionNote: string | null;
  acknowledged: boolean; createdAt: string;
  attachmentsSha256: string;
}
export interface DocumentDetail { document: DocumentSummary; versions: DocumentVersion[] }
export interface DocumentList { items: DocumentSummary[]; total: number }
export interface DocumentEvent {
  id: string; versionId: string; actorId: string; occurredAt: string; operation: string;
  before: Record<string, unknown> | null; after: Record<string, unknown>;
}
export type ReportKind = 'incident' | 'near_miss' | 'nonconformity' | 'complaint';
export type ReportSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ReportStatus = 'reported' | 'in_analysis' | 'action_plan' | 'effectiveness_review' | 'closed';
export type ReportCommand = 'start_analysis' | 'plan_actions' | 'request_review' | 'close' | 'return_for_action' | 'reopen';
export type ReportCurrency = 'XOF' | 'XAF' | 'MAD' | 'EUR' | 'USD' | 'GBP';
export type Ishikawa = Partial<Record<'people' | 'methods' | 'machines' | 'materials' | 'environment' | 'measurement', string>>;
export interface Report {
  id: string; title: string; description: string; kind: ReportKind; severity: ReportSeverity;
  siteId: string; siteName: string; occurredAt: string; reportedBy: string; status: ReportStatus;
  ownerId: string | null; verifierId: string | null; correction: string; rootCause: string; fiveWhys: string[]; ishikawa: Ishikawa;
  costAmount: string; currency: ReportCurrency; revision: number;
  effectiveness: 'not_evaluated' | 'effective' | 'ineffective'; effectivenessNote: string | null;
  reviewedBy: string | null; reviewedAt: string | null; closedAt: string | null;
  createdAt: string; updatedAt: string;
  attachmentsSha256: string;
}
export interface ReportDetail { report: Report; actions: Action[] }
export interface ReportList { items: Report[]; total: number }
export interface ReportEvent {
  id: string; actorId: string; occurredAt: string; operation: string;
  before: Record<string,unknown> | null; after: Record<string,unknown>;
}
export type AttachmentParent = 'document_version' | 'report';
export type AttachmentStatus = 'pending' | 'ready' | 'rejected' | 'deleted';
export interface Attachment {
  id:string; parentType:AttachmentParent; parentId:string; filename:string; mimeType:string;
  size:number; sha256:string; status:AttachmentStatus; revision:number; createdBy:string;
  createdAt:string; expiresAt:string; readyAt:string|null; rejectionReason:string|null;
  canConfirm:boolean; canRemove:boolean;
}
export interface AttachmentList { items:Attachment[]; canUpload:boolean; uploadEnabled:boolean; maxBytes:number; maxFiles:number }
export interface UploadTicket { attachment:Attachment; upload:{ url:string; fields:Record<string,string>; expiresAt:string } }
export interface AttachmentEvent{id:string;actorId:string;actorName:string;occurredAt:string;operation:string;before:Record<string,unknown>|null;after:Record<string,unknown>}
export type AuditStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type AuditResult = 'pending' | 'conform' | 'nonconform' | 'not_applicable';
export interface AuditChecklistItem { id:string; clause:string; question:string; result:AuditResult; evidence:string }
export interface QualityAudit {
  id:string; title:string; standard:string; scope:string; siteId:string; siteName:string;
  startsOn:string; endsOn:string; leadId:string; auditeeId:string; createdBy:string; status:AuditStatus;
  leadQualificationId:string|null; leadQualificationSnapshot:AuditorQualificationProof|null;
  checklist:AuditChecklistItem[]; conclusion:string; replanReason:string; revision:number; completedAt:string|null;
  reportSnapshot:AuditReportSnapshot|null; createdAt:string; updatedAt:string;
}
export interface AuditFinding { id:string; itemId:string; reportId:string; reportStatus:ReportStatus; createdBy:string; createdAt:string }
export interface QualityAuditDetail { audit:QualityAudit; findings:AuditFinding[]; templateUses:AuditTemplateUse[]; leadQualificationReady:boolean }
export interface QualityAuditList { items:QualityAudit[]; total:number }

export interface AuditReportSnapshot {
  schemaVersion?:number; leadQualification?:AuditorQualificationProof|null; templateSources?:AuditTemplateSource[]; auditId?:string; tenantName?:string; siteName?:string;
  title:string; standard:string; scope:string; siteId:string; startsOn:string; endsOn:string;
  leadId:string; auditeeId:string; leadName?:string; auditeeName?:string;
  completedBy:string; completedByName?:string; completedAt:string; conclusion:string;
  checklist:AuditChecklistItem[]; findings:{itemId:string;reportId:string}[];
}

export interface AuditTemplate {
  id:string; siteId:string; code:string; number:number; title:string; standard:string;
  changeNote:string; checklist:AuditChecklistItem[]; contentSha256:string; createdBy:string; createdAt:string;
}
export interface AuditTemplateList { items:AuditTemplate[]; total:number }
export interface AuditTemplateSource {
  templateId:string; code:string; number:number; title:string; contentSha256:string;
  appliedRevision:number; appliedBy:string; appliedAt:string;
}
export interface AuditTemplateUse extends AuditTemplateSource { id:string }

export interface AuditProgrammeCounts {
  total:number; planned:number; inProgress:number; completed:number; cancelled:number; overdue:number;
}
export interface AuditProgramme {
  year:number; asOf:string; counts:AuditProgrammeCounts;
  months:({month:number}&AuditProgrammeCounts)[];
}

export interface AuditorQualification {
  id:string; siteId:string; userId:string; standard:string; validFrom:string; validUntil:string;
  evidenceReference:string; assessment:string; assessedBy:string; createdAt:string;
  status:'valid'|'future'|'expired'|'revoked'; revocationReason:string|null; revokedBy:string|null; revokedAt:string|null;
}
export interface AuditorQualificationList { items:AuditorQualification[]; total:number }
export interface AuditorQualificationProof {
  id:string; siteId:string; userId:string; standard:string; validFrom:string; validUntil:string;
  evidenceReference:string; assessment:string; assessedBy:string; assessorName?:string; auditorName?:string;
  issuedAt:string; checkedAt:string;
}

export interface ActionComment {
  id:string; actionId:string; authorId:string; authorName:string; body:string; createdAt:string;
}
export interface ActionCommentList { items:ActionComment[]; total:number }

export interface WorkspaceNotification {
  id:string; kind:'action_assigned'|'action_comment'; actionId:string; actionTitle:string; reportId:string|null; riskId:string|null; obligationId:string|null;
  actorId:string; actorName:string; createdAt:string; readAt:string|null;
}
export interface NotificationList { items:WorkspaceNotification[]; total:number; unread:number }
export interface NotificationReceipt { id:string; readAt:string }

export type RiskCategory='quality'|'safety'|'environment'|'compliance'|'governance'|'other';
export type RiskStatus='active'|'accepted'|'archived';
export interface Risk {
  id:string; siteId:string; siteName:string; title:string; description:string; category:RiskCategory; ownerId:string; createdBy:string;
  inherentLikelihood:number; inherentSeverity:number; residualLikelihood:number; residualSeverity:number;
  inherentScore:number; residualScore:number; controls:string; nextReviewOn:string; reviewOverdue:boolean;
  status:RiskStatus; acceptanceNote:string|null; acceptedBy:string|null; acceptedAt:string|null;
  lastChangeNote:string; revision:number; createdAt:string; updatedAt:string;
}
export interface RiskDetail {risk:Risk;actions:Action[]}
export interface RiskList {items:Risk[];total:number;scopeTotal:number;overdue:number;matrix:{likelihood:number;severity:number;count:number}[]}

export interface OverviewSummary {
  asOf:string; asOfDate:string; siteCount:number;
  actions:{total:number;open:number;closed:number;overdue:number;dueSoon:number;owners:number};
  documents:{published:number;unread:number};reports:{open:number;criticalOpen:number};
  audits:{planned:number;inProgress:number;overdue:number}|null;
  risks:{tracked:number;critical:number;high:number;moderate:number;low:number;reviewOverdue:number}|null;
  compliance:{total:number;unverified:number;notAssessed:number;compliant:number;partial:number;noncompliant:number;notApplicable:number;overdue:number}|null;
  notificationUnread:number;nextActions:Action[];
}

export type ObligationAssessmentStatus='not_assessed'|'compliant'|'partial'|'noncompliant'|'not_applicable';
export interface Obligation {
  id:string;siteId:string;siteName:string;title:string;jurisdiction:string;sourceTitle:string;sourceVersion:string;article:string;sourceUrl:string;excerpt:string;sourceSha256:string;
  ownerId:string;createdBy:string;nextReviewOn:string;reviewOverdue:boolean;lifecycle:'active'|'archived';sourceStatus:'unverified'|'verified';
  verificationNote:string|null;verifiedBy:string|null;verifiedAt:string|null;assessmentStatus:ObligationAssessmentStatus;assessmentNote:string|null;
  evidenceReference:string|null;assessedBy:string|null;assessedAt:string|null;lastChangeNote:string;revision:number;createdAt:string;updatedAt:string;
}
export interface ObligationList {items:Obligation[];total:number;unverified:number;overdue:number}

export interface ObligationActionList extends ActionList {open:number}
