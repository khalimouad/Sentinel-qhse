'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, ActionList, AuditEvent, CreateAction, MeResponse, TenantSummary, WorkspaceContext } from '@sentinelle/contracts';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string,tenant?: string,options?: RequestInit): Promise<T> {
  // Bound the entire request, including reading its response body. Component
  // cancellation still aborts silently through the caller's existing checks.
  const timeout=AbortSignal.timeout(path.startsWith('attachments/')&&path.endsWith('/confirm')?70000:25000);
  const signal=options?.signal?AbortSignal.any([options.signal,timeout]):timeout;
  try {
    const response = await fetch(`/api/v1/${path}`,{
      ...options,signal,cache:'no-store',
      headers: { ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...(tenant ? { 'X-Tenant-Id': tenant } : {}) },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const messages: Record<number,string> = {401:'Connectez-vous pour accéder à votre espace.',403:'Vous n’avez pas accès à cet espace ou à cette opération.',409:'Les données ou le statut ont changé. Actualisez avant de recommencer.'};
      const specific=typeof body.message==='string'?body.message:undefined;
      throw new ApiError(response.status,(response.status===409?specific:undefined)||messages[response.status]||specific||'L’opération a échoué.');
    }
    return await response.json();
  } catch(error) {
    if(timeout.aborted&&!options?.signal?.aborted)throw new Error('Le serveur met trop de temps à répondre. Réessayez dans quelques instants.');
    if(error instanceof TypeError&&!options?.signal?.aborted)throw new Error('Impossible de joindre le service. Vérifiez votre connexion et réessayez.');
    throw error;
  }
}
export function useWorkspace() {
  const [context,setContext] = useState<WorkspaceContext | null>(null);
  const [actions,setActions] = useState<Action[]>([]);
  const [error,setError] = useState('');
  const [needsLogin,setNeedsLogin] = useState(false);
  const [loading,setLoading] = useState(true);
  const [pending,setPending] = useState(false);
  const [authentication,setAuthentication] = useState('');
  const [tenants,setTenants] = useState<TenantSummary[]>([]);
  const [selectedTenant,setSelectedTenant] = useState('');
  const loadGeneration = useRef(0);
  const activeTenant = useRef<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const generation = ++loadGeneration.current;
    activeTenant.current=null;
    setLoading(true); setError(''); setNeedsLogin(false); setAuthentication(''); setTenants([]); setContext(null); setActions([]);
    try {
      const me = await api<MeResponse>('me',undefined,{ signal });
      if (generation !== loadGeneration.current || signal?.aborted) return;
      setAuthentication(me.authentication); setNeedsLogin(false);
      setTenants(me.tenants);
      const tenant = me.tenants.find(item => item.id === selectedTenant) || me.tenants[0];
      if (!tenant) throw new Error('Aucune organisation n’est associée à votre compte.');
      const workspace = await api<WorkspaceContext>('context',tenant.id,{ signal });
      // Load up to 100 records in this first foundation increment.
      const result = await api<ActionList>('actions?limit=100',tenant.id,{ signal });
      if (!signal?.aborted && generation === loadGeneration.current) { activeTenant.current=workspace.tenant.id; setContext(workspace); setActions(result.items); }
    } catch (e) {
      if (signal?.aborted || generation !== loadGeneration.current) return;
      setContext(null); setActions([]);
      setNeedsLogin(e instanceof ApiError && e.status === 401);
      setError(e instanceof Error ? e.message : 'Impossible de charger votre espace.');
    } finally { if (!signal?.aborted && generation === loadGeneration.current) setLoading(false); }
  },[selectedTenant]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); },[load]);
  async function createAction(input: CreateAction) {
    if (!context) throw new Error('Votre espace n’est pas chargé.');
    setPending(true);
    try { const saved = await api<Action>('actions',context.tenant.id,{ method: 'POST',body: JSON.stringify(input) }); setActions(current => [saved,...current].slice(0,100)); return saved; }
    finally { setPending(false); }
  }
  async function updateAction(id: string) {
    if (!context) throw new Error('Votre espace n’est pas chargé.');
    const action = actions.find(a => a.id === id);
    if (!action) throw new Error('Action introuvable.');
    setPending(true);
    try {
      const saved = await api<Action>(`actions/${id}`,context.tenant.id,{ method: 'PATCH',body: JSON.stringify({ version: action.version,status: action.status === 'open' ? 'closed' : 'open' }) });
      setActions(current => current.map(a => a.id === id ? saved : a));
    } catch (e) { if (e instanceof ApiError && e.status === 409) await load(); throw e; }
    finally { setPending(false); }
  }
  async function history(id: string) {
    if (!context) throw new Error('Votre espace n’est pas chargé.');
    return api<AuditEvent[]>(`actions/${id}/history`,context.tenant.id);
  }
  async function refreshActions() {
    if(!context) return;
    const tenant=context.tenant.id;
    const result=await api<ActionList>('actions?limit=100',tenant);
    if(activeTenant.current===tenant) setActions(result.items);
  }
  return { context,actions,tenants,error,needsLogin,loading,pending,authentication,refresh: () => load(),refreshActions,switchTenant: setSelectedTenant,createAction,updateAction,history };
}
