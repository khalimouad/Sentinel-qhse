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
}
export interface DocumentDetail { document: DocumentSummary; versions: DocumentVersion[] }
export interface DocumentList { items: DocumentSummary[]; total: number }
export interface DocumentEvent {
  id: string; versionId: string; actorId: string; occurredAt: string; operation: string;
  before: Record<string, unknown> | null; after: Record<string, unknown>;
}
