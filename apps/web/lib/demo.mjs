// Browser-only fixtures. Never imported by API, authentication or database code.
const KEY='sentinelle-demo-v1';
const uid=(n)=>`d0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const demoPath=()=>typeof window!=='undefined'&&(window.location.pathname==='/demo'||window.location.pathname.startsWith('/demo/'));
const now=()=>new Date().toISOString();
const day=(offset=0)=>{const date=new Date();date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);};
const tenant={id:uid(1),name:'Atlas Démonstration — entreprise fictive',region:'Afrique + Europe · démo',jurisdictions:['CI','FR'],role:'admin',revision:1};
const members=[{id:uid(2),name:'Alex Démo'},{id:uid(3),name:'Aïcha Exemple'},{id:uid(4),name:'Camille Exemple'}];
const sites=[{id:uid(5),name:'Abidjan · Site fictif',countryCode:'CI',revision:1},{id:uid(6),name:'Lyon · Site fictif',countryCode:'FR',revision:1}];
function seed(){
 const base={createdAt:now(),updatedAt:now(),revision:1,siteId:sites[0].id,siteName:sites[0].name,ownerId:members[0].id,createdBy:members[1].id};
 return {schema:1,tenant:{...tenant},members:structuredClone(members),sites:structuredClone(sites),
 actions:[['Vérifier les extincteurs — exercice fictif',-3,'high'],['Réviser la procédure d’accueil — exemple',7,'normal'],['Former l’équipe au tri — exemple',20,'normal']].map(([title,offset,priority],i)=>({id:uid(10+i),title,origin:'Démonstration',siteId:sites[i%2].id,siteName:sites[i%2].name,ownerId:members[0].id,ownerName:members[0].name,priority,status:'open',dueDate:day(offset),version:1,createdAt:now(),updatedAt:now(),reportId:null,riskId:null,obligationId:null})),
 reports:[{...base,id:uid(20),title:'Sol glissant dans l’atelier — exemple fictif',description:'Scénario de démonstration : une fuite d’eau a été signalée et la zone a été balisée.',kind:'near_miss',severity:'medium',occurredAt:now(),reportedBy:members[0].id,status:'reported',verifierId:members[1].id,correction:'Zone balisée — simulation',rootCause:'',fiveWhys:[],ishikawa:{},costAmount:'0',currency:'XOF',effectiveness:'not_evaluated',effectivenessNote:null,reviewedBy:null,reviewedAt:null,closedAt:null,attachmentsSha256:'démo — aucun fichier'}],
 risks:[{...base,id:uid(30),title:'Chute de plain-pied — exemple fictif',description:'Exemple de cotation pour explorer la matrice.',category:'safety',inherentLikelihood:4,inherentSeverity:3,residualLikelihood:2,residualSeverity:3,inherentScore:12,residualScore:6,controls:'Balisage et inspection quotidienne — simulation',nextReviewOn:day(30),reviewOverdue:false,status:'active',acceptanceNote:null,acceptedBy:null,acceptedAt:null,lastChangeNote:'Exemple initial'}],
 obligations:[{...base,id:uid(40),title:'Contrôle périodique — obligation fictive',jurisdiction:'FR',sourceTitle:'Texte fictif de démonstration (sans valeur réglementaire)',sourceVersion:'Exemple 1',article:'Article fictif 1',sourceUrl:'https://example.com',excerpt:'Ce contenu est inventé pour la démonstration. Il ne constitue pas une référence réglementaire.',sourceSha256:'démo — référence fictive',nextReviewOn:day(45),reviewOverdue:false,lifecycle:'active',sourceStatus:'verified',verificationNote:'Vérification simulée, aucune portée juridique.',verifiedBy:members[2].id,verifiedAt:now(),assessmentStatus:'not_assessed',assessmentNote:null,evidenceReference:null,assessedBy:null,assessedAt:null,lastChangeNote:'Exemple fictif'}],
 documents:[{document:{id:uid(50),code:'DEMO-001',title:'Accueil sécurité — procédure fictive',siteId:sites[0].id,siteName:sites[0].name,lastVersion:1,status:'published',updatedAt:now()},versions:[{id:uid(51),number:1,content:'DOCUMENT DE DÉMONSTRATION\n\n1. Se présenter à l’accueil.\n2. Lire les consignes du site.\n3. Signaler tout danger au responsable.\n\nExemple fictif, à ne pas utiliser comme procédure réelle.',contentSha256:'démo — contenu fictif',attachmentsSha256:'démo — aucun fichier',status:'published',authorId:members[1].id,reviewerId:members[2].id,approverId:members[0].id,revision:1,reviewedAt:now(),approvedAt:now(),decisionNote:'Approbation simulée',acknowledged:false,createdAt:now()}]}],
 audits:[{...base,id:uid(60),title:'Audit accueil sécurité — exercice fictif',standard:'ISO 45001',scope:'Exemple de visite d’accueil',startsOn:day(3),endsOn:day(4),leadId:members[0].id,auditeeId:members[1].id,status:'planned',leadQualificationId:null,leadQualificationSnapshot:null,checklist:[{id:uid(61),clause:'7.3',question:'Les consignes sont-elles présentées ? — exemple',result:'pending',evidence:''}],conclusion:'',replanReason:'',completedAt:null,reportSnapshot:null}],
 comments:[],history:{},platformEvents:[],accounts:[{...members[0],issuer:'urn:sentinelle:demo',subject:'alex-demo',role:'admin',enabled:true,revision:1,allSites:true,siteIds:[]}],notifications:[]};
}
let memory;
function read(){if(memory)return memory;try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.schema===1&&Array.isArray(saved.actions)&&saved.tenant?.id===tenant.id)memory=saved;}catch{}return memory||=seed();}
function persist(state){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{throw new Error('Le navigateur ne permet pas de conserver la démonstration. Libérez du stockage ou autorisez le stockage local.');}}
export function resetDemo(){localStorage.removeItem(KEY);memory=seed();window.location.reload();}
function page(items,q){const offset=Math.max(0,Number(q.get('offset')||0)),limit=Math.min(100,Math.max(1,Number(q.get('limit')||25)));return {items:items.slice(offset,offset+limit),total:items.length};}
function filter(items,q){const search=(q.get('search')||'').toLowerCase();return items.filter(x=>(!q.get('siteId')||x.siteId===q.get('siteId'))&&(!search||`${x.title||x.name||''} ${x.description||''} ${x.sourceTitle||''} ${x.jurisdiction||''}`.toLowerCase().includes(search)));}
function history(s,id,before,after,operation){const event={id:crypto.randomUUID(),actionId:id,actorId:members[0].id,actorName:members[0].name,occurredAt:now(),operation,before:structuredClone(before),after:structuredClone(after)};(s.history[id]||=[]).unshift(event);return event;}
function unsupported(){throw new Error('Cette opération n’est pas simulée dans cette démonstration. Aucun appel au service réel n’a été effectué.');}
export async function demoApi(path,tenantId,options={}){
 options.signal?.throwIfAborted();
 const s=read(),url=new URL(path,'https://demo.invalid/'),q=url.searchParams,[kind,id,command]=url.pathname.slice(1).split('/'),method=options.method||'GET',input=options.body?JSON.parse(String(options.body)):{};
 if(tenantId&&tenantId!==s.tenant.id)throw new Error('Cette entreprise ne fait pas partie de la démonstration.');
 let result;
 const detail=(collection,item)=>kind==='reports'?{report:item,actions:s.actions.filter(a=>a.reportId===item.id)}:kind==='risks'?{risk:item,actions:s.actions.filter(a=>a.riskId===item.id)}:kind==='audits'?{audit:item,findings:[],templateUses:[],leadQualificationReady:false}:item;
 const action=(data,links={})=>{const site=s.sites.find(x=>x.id===data.siteId);const owner=s.members.find(x=>x.id===data.ownerId);if(!site||!owner)throw new Error('Sélectionnez un site et un responsable de démonstration.');const item={id:crypto.randomUUID(),title:data.title,origin:'Démonstration',siteId:site.id,siteName:site.name,ownerId:owner.id,ownerName:owner.name,priority:data.priority||'normal',status:'open',dueDate:data.dueDate||null,version:1,createdAt:now(),updatedAt:now(),reportId:null,riskId:null,obligationId:null,...links};s.actions.unshift(item);history(s,item.id,null,item,'INSERT');return item;};
 if(kind==='me')result={actor:s.members[0],tenants:[s.tenant],authentication:'demo'};
 else if(kind==='context')result={actor:s.members[0],tenant:s.tenant,sites:s.sites,members:s.members,canWrite:true,documentReviewers:Object.fromEntries(s.sites.map(site=>[site.id,s.members]))};
 else if(kind==='overview'){
  const a=filter(s.actions,q),r=filter(s.risks,q),o=filter(s.obligations,q),reports=filter(s.reports,q),audits=filter(s.audits,q),docs=filter(s.documents.map(d=>d.document),q);const open=a.filter(x=>x.status==='open');
  result={asOf:now(),asOfDate:day(),siteCount:q.get('siteId')?1:s.sites.length,actions:{total:a.length,open:open.length,closed:a.length-open.length,overdue:open.filter(x=>x.dueDate&&x.dueDate<day()).length,dueSoon:open.filter(x=>x.dueDate&&x.dueDate>=day()&&x.dueDate<=day(30)).length,owners:new Set(a.map(x=>x.ownerId)).size},documents:{published:docs.filter(x=>x.status==='published').length,unread:s.documents.filter(x=>docs.some(d=>d.id===x.document.id)&&!x.versions[0].acknowledged).length},reports:{open:reports.filter(x=>x.status!=='closed').length,criticalOpen:reports.filter(x=>x.status!=='closed'&&x.severity==='critical').length},audits:{planned:audits.filter(x=>x.status==='planned').length,inProgress:audits.filter(x=>x.status==='in_progress').length,overdue:0},risks:{tracked:r.length,critical:r.filter(x=>x.residualScore>=17).length,high:r.filter(x=>x.residualScore>=10&&x.residualScore<17).length,moderate:r.filter(x=>x.residualScore>=5&&x.residualScore<10).length,low:r.filter(x=>x.residualScore<5).length,reviewOverdue:r.filter(x=>x.reviewOverdue).length},compliance:{total:o.length,unverified:o.filter(x=>x.sourceStatus==='unverified').length,notAssessed:o.filter(x=>x.assessmentStatus==='not_assessed').length,compliant:o.filter(x=>x.assessmentStatus==='compliant').length,partial:o.filter(x=>x.assessmentStatus==='partial').length,noncompliant:o.filter(x=>x.assessmentStatus==='noncompliant').length,notApplicable:o.filter(x=>x.assessmentStatus==='not_applicable').length,overdue:o.filter(x=>x.reviewOverdue).length},notificationUnread:0,nextActions:open.slice(0,6)};
 }
 else if(kind==='actions'){
  const item=s.actions.find(x=>x.id===id);
  if(id==='export'&&method==='GET'){const items=filter(s.actions,q).filter(item=>!q.get('status')||item.status===q.get('status'));if(items.length>10000)throw new Error('L’export dépasse 10 000 actions. Affinez les filtres.');result={items,total:items.length};}
  else if(!id)result=method==='POST'?action(input):page(filter(s.actions,q).filter(item=>!q.get('status')||item.status===q.get('status')),q);
  else if(!item)throw new Error('Action de démonstration introuvable.');
  else if(command==='history')result=s.history[id]||[];
  else if(command==='effectiveness'){if(method==='POST')unsupported();result={items:[],total:0};}
  else if(command==='comments'){
   if(method==='POST'){let comment=s.comments.find(x=>x.actionId===id&&x.key===input.idempotencyKey);if(!comment){comment={id:crypto.randomUUID(),actionId:id,authorId:members[0].id,authorName:members[0].name,body:input.body,createdAt:now(),key:input.idempotencyKey};s.comments.push(comment);}result=comment;}else result=page(s.comments.filter(x=>x.actionId===id).slice().reverse(),q);
  }else if(method==='PATCH'){if(item.version!==input.version)throw new Error('Cette action a changé. Actualisez.');const before=structuredClone(item);item.status=input.status;item.version++;item.updatedAt=now();history(s,id,before,item,'UPDATE');result=item;}else result=item;
 }
 else if(kind==='processes'){if(method!=='GET')unsupported();result={items:[],total:0};}
 else if(kind==='ethics'){if(method!=='GET')unsupported();result=command==='relations'?{items:[],total:0,assessments:0,gifts:0,conflicts:0,donations:0}:id==='summary'?{asOf:now(),asOfDate:day(),thirdParties:{total:0,withAssessment:0,withoutAssessment:0,highRisk:0},assessments:{total:0,awaitingDecision:0,overdueReview:0},declarations:{gifts:0,conflicts:0,donations:0,awaitingDecision:0},controls:{total:0,plannedTests:0,overdueTests:0,completedTests:0,nonEffectiveTests:0,openActions:0}}:{items:[],total:0};}
 else if(kind==='attachments'){if(method!=='GET')unsupported();result={items:[],canUpload:false,uploadEnabled:false,maxBytes:0,maxFiles:0};}
 else if(kind==='notifications')result=id==='unread-count'?{unread:0}:{items:[],total:0,unread:0};
 else if(kind==='audit-templates'||kind==='auditor-qualifications'){if(method!=='GET')unsupported();result=id?[]:{items:[],total:0};}
 else if(kind==='audits'&&id==='programme'){
  const year=Number(q.get('year')||new Date().getUTCFullYear()),audits=filter(s.audits,q).filter(a=>Number(a.startsOn.slice(0,4))<=year&&Number(a.endsOn.slice(0,4))>=year);
  const counts=items=>({total:items.length,planned:items.filter(x=>x.status==='planned').length,inProgress:items.filter(x=>x.status==='in_progress').length,completed:items.filter(x=>x.status==='completed').length,cancelled:items.filter(x=>x.status==='cancelled').length,overdue:items.filter(x=>x.status==='planned'&&x.startsOn<day()).length});result={year,asOf:now(),counts:counts(audits),months:Array.from({length:12},(_,i)=>({month:i+1,...counts(audits.filter(a=>a.startsOn.slice(0,7)<=`${year}-${String(i+1).padStart(2,'0')}`&&a.endsOn.slice(0,7)>=`${year}-${String(i+1).padStart(2,'0')}`))}))};
 }
 else if(kind==='documents'){
  const item=s.documents.find(x=>x.document.id===id);
  if(!id){if(method!=='GET')unsupported();result=page(filter(s.documents.map(x=>x.document),q),q);}
  else if(!item)throw new Error('Document fictif introuvable.');
  else if(command==='history')result=s.history[id]||[];
  else if(command==='versions'&&url.pathname.endsWith('/distribution-candidates')){if(method!=='GET')unsupported();result=page(filter(s.members,q),q);}
  else if(command==='versions'&&url.pathname.endsWith('/reminders')){if(method!=='GET')unsupported();result={items:[],total:0};}
  else if(command==='versions'&&url.pathname.endsWith('/distribution')){if(method!=='GET')unsupported();result={items:[],total:0,active:0,acknowledged:0};}
  else if(command==='versions'&&url.pathname.endsWith('/acknowledgements')&&method==='GET'){const version=item.versions.find(v=>v.id===url.pathname.split('/')[4]);if(!version)throw new Error('Version introuvable.');result=page(version.acknowledged?[{userId:members[0].id,userName:members[0].name,acknowledgedAt:now()}]:[],q);}
  else if(command==='versions'&&url.pathname.endsWith('/acknowledgements')){item.versions[0].acknowledged=true;result=item;}
  else if(method==='GET')result=item;else unsupported();
 }
 else if(['reports','risks','obligations','audits'].includes(kind)){
  const collection=s[kind],item=collection.find(x=>x.id===id);
  if(!id||id==='export'){
   if(method==='POST')unsupported();let scoped=filter(collection,q);
   for(const key of ['status','category','lifecycle','assessmentStatus']){const value=q.get(key==='assessmentStatus'?'assessment':key);if(value&&value!=='all')scoped=scoped.filter(x=>x[kind==='obligations'&&key==='status'?'assessmentStatus':key]===value);}
   if(kind==='risks'&&q.get('likelihood'))scoped=scoped.filter(x=>x.residualLikelihood===Number(q.get('likelihood'))&&x.residualSeverity===Number(q.get('severity')));
   if(id==='export'&&scoped.length>10000)throw new Error('L’export dépasse 10 000 résultats. Affinez les filtres.');
   result=id==='export'?{items:scoped,total:scoped.length}:page(scoped,q);
   if(kind==='risks'){const base=filter(collection,q).filter(x=>!q.get('status')||x.status===q.get('status'));result={...result,scopeTotal:base.length,overdue:base.filter(x=>x.reviewOverdue).length,matrix:base.map(x=>({likelihood:x.residualLikelihood,severity:x.residualSeverity,count:1}))};}
   if(kind==='obligations')result={...result,unverified:scoped.filter(x=>x.sourceStatus==='unverified').length,overdue:scoped.filter(x=>x.reviewOverdue).length};
  }else if(!item)throw new Error('Exemple de démonstration introuvable.');
  else if(command==='history')result=s.history[id]||[];
  else if(command==='actions'){
   const link={reports:'reportId',risks:'riskId',obligations:'obligationId'}[kind];if(!link)unsupported();
   if(method==='POST'){if(input.revision!==item.revision)throw new Error('Actualisez la fiche.');action({...input,siteId:item.siteId},{[link]:id});item.revision++;result=detail(collection,item);}else{const items=s.actions.filter(x=>x[link]===id);result={...page(items,q),open:items.filter(x=>x.status==='open').length};}
  }else if(method==='GET')result=detail(collection,item);else unsupported();
 }
 else if(kind==='platform'){
  const parts=url.pathname.slice(1).split('/');const companyId=parts[2];
  if(id==='context')result={issuer:'urn:sentinelle:demo'};
  else if(id!=='companies')unsupported();
  else if(!companyId){if(method!=='GET')unsupported();result=page([s.tenant].filter(x=>x.name.toLowerCase().includes((q.get('search')||'').toLowerCase())),q);}
  else if(companyId!==s.tenant.id)throw new Error('Entreprise fictive introuvable.');
  else if(parts[3]==='accounts'){if(method!=='GET')unsupported();result=page(s.accounts.filter(x=>(q.get('role')==='all'||!q.get('role')||q.get('role')===x.role)&&(q.get('status')==='all'||!q.get('status')||x.enabled===(q.get('status')==='active'))&&`${x.name} ${x.subject}`.toLowerCase().includes((q.get('search')||'').toLowerCase())),q);}
  else if(parts[3]==='history')result=page(s.platformEvents,q);
  else if(parts.length===3)result={...s.tenant,sites:s.sites,accountCount:s.accounts.length,eventCount:s.platformEvents.length};else unsupported();
 }
 else unsupported();
 if(method!=='GET')persist(s);
 options.signal?.throwIfAborted();return structuredClone(result);
}
