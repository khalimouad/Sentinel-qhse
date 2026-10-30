// Spreadsheet applications may evaluate text cells beginning with a formula marker.
function cell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export function actionsCsv(items) {
  const fields = [['Identifiant','id'],['Intitulé','title'],['Origine','origin'],['Site','siteName'],['Responsable','ownerName'],['Priorité','priority'],['Statut','status'],['Échéance','dueDate'],['Création','createdAt'],['Modification','updatedAt'],['Signalement','reportId'],['Risque','riskId'],['Obligation','obligationId']];
  return '\ufeff'+[fields.map(([label])=>cell(label)).join(';'),...items.map(item=>fields.map(([,key])=>cell(item[key])).join(';'))].join('\r\n')+'\r\n';
}
