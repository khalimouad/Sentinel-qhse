export class DocumentWorkflowError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function decideDocument(version, command, actorId, canWrite) {
  if (!canWrite) throw new DocumentWorkflowError(403, 'Votre rôle ne permet pas de valider un document.');
  const transitions = {
    submit: { from: 'draft', to: 'in_review', actor: 'authorId' },
    verify: { from: 'in_review', to: 'pending_approval', actor: 'reviewerId' },
    approve: { from: 'pending_approval', to: 'published', actor: 'approverId' },
    reject: version.status === 'in_review'
      ? { from: 'in_review', to: 'rejected', actor: 'reviewerId' }
      : { from: 'pending_approval', to: 'rejected', actor: 'approverId' },
  };
  const transition = transitions[command];
  if (!transition || version.status !== transition.from) throw new DocumentWorkflowError(409, 'Le statut du document ne permet plus cette opération.');
  if (version[transition.actor] !== actorId) throw new DocumentWorkflowError(403, 'Cette étape est réservée à la personne désignée.');
  return transition.to;
}
export function validateParticipants(authorId, reviewerId, approverId) {
  if (new Set([authorId,reviewerId,approverId]).size !== 3) {
    throw new DocumentWorkflowError(400, 'Auteur, vérificateur et approbateur doivent être trois personnes différentes.');
  }
}
