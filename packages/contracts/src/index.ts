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
  reportId: string | null;
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
export interface Report {
  id: string; title: string; description: string; kind: ReportKind; severity: ReportSeverity;
  siteId: string; siteName: string; occurredAt: string; reportedBy: string; status: ReportStatus;
  ownerId: string | null; verifierId: string | null; correction: string; rootCause: string; fiveWhys: string[];
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
  checklist:AuditChecklistItem[]; conclusion:string; revision:number; completedAt:string|null;
  reportSnapshot:Record<string,unknown>|null; createdAt:string; updatedAt:string;
}
export interface AuditFinding { id:string; itemId:string; reportId:string; reportStatus:ReportStatus; createdBy:string; createdAt:string }
export interface QualityAuditDetail { audit:QualityAudit; findings:AuditFinding[] }
export interface QualityAuditList { items:QualityAudit[]; total:number }
