export class ReportWorkflowError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
export function validateCost(amount,currency) {
  if (!['XOF','XAF','MAD','EUR','USD','GBP'].includes(currency) || !/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)) {
    throw new ReportWorkflowError(400,'Le coût doit être un montant positif avec une devise prise en charge.');
  }
  if (['XOF','XAF'].includes(currency) && /\.[0-9]*[1-9]/.test(amount)) {
    throw new ReportWorkflowError(400,'Le franc CFA ne comporte pas de fraction monétaire.');
  }
}
export function decideReport(report,command,actorId,canWrite,actions,note='') {
  if (!canWrite) throw new ReportWorkflowError(403,'Votre rôle ne permet pas de traiter un signalement.');
  const transitions={
    start_analysis:['reported','in_analysis'], plan_actions:['in_analysis','action_plan'],
    request_review:['action_plan','effectiveness_review'], close:['effectiveness_review','closed'],
    return_for_action:['effectiveness_review','action_plan'], reopen:['closed','action_plan'],
  };
  const transition=transitions[command];
  if (!transition || report.status!==transition[0]) throw new ReportWorkflowError(409,'Le statut du signalement ne permet plus cette opération.');
  if (!report.ownerId || !report.verifierId || report.ownerId===report.verifierId) throw new ReportWorkflowError(400,'Désignez un responsable et un vérificateur différents.');
  if (['plan_actions','request_review','close'].includes(command) && (!report.rootCause.trim() || !report.correction.trim())) {
    throw new ReportWorkflowError(400,'Renseignez la cause racine et la correction immédiate.');
  }
  if (['request_review','close'].includes(command) && (!actions.length || actions.some(action=>action.status!=='closed'))) {
    throw new ReportWorkflowError(409,'Toutes les actions liées doivent être clôturées avant la vérification.');
  }
  if (['close','return_for_action'].includes(command) && report.verifierId!==actorId) throw new ReportWorkflowError(403,'Cette décision est réservée au vérificateur désigné.');
  if (['close','return_for_action','reopen'].includes(command) && !note.trim()) throw new ReportWorkflowError(400,'Une justification est obligatoire.');
  return transition[1];
}
