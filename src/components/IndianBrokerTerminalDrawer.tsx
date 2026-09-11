import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Lock, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { ApiClient } from '../services/apiClient';
import { moneyINR } from '../domain/portfolio';

type BrokerId = 'kotak_neo' | 'flattrade';

const BROKERS: Record<BrokerId, { label: string; initials: string; color: string; authUrl?: string; note: string }> = {
  kotak_neo: {
    label: 'Kotak Neo', initials: 'KN', color: 'bg-rose-600',
    note: 'Paste the current authenticated Neo session values. Your MPIN, TOTP secret, and password are never requested or stored.',
  },
  flattrade: {
    label: 'Flattrade Pi', initials: 'FT', color: 'bg-sky-600',
    note: 'Authorize in Flattrade Pi first, then paste the daily Pi access token. API execution is limited by Flattrade’s retail-algo rules.',
  },
};

interface Props { open: boolean; onClose: () => void; }

export function IndianBrokerTerminalDrawer({ open, onClose }: Props) {
  const [broker, setBroker] = useState<BrokerId>('kotak_neo');
  const [values, setValues] = useState<Record<string, string>>({});
  const [account, setAccount] = useState<any>(null);
  const [funds, setFunds] = useState<any>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [streamReadiness, setStreamReadiness] = useState<any>(null);
  const [instrumentMasterStatus, setInstrumentMasterStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(() => broker === 'kotak_neo' ? [
    ['consumerKey', 'Consumer key'], ['ucc', 'Client code (UCC)'], ['sessionToken', 'Trade session token'], ['sid', 'Session ID (SID)'],
  ] : [
    ['userId', 'User ID / UCC'], ['accountId', 'Account ID'], ['accessToken', 'Daily Pi access token'],
  ], [broker]);

  const refresh = async () => {
    setLoading(true); setError(null);
    try {
      const [accountResponse, fundsResponse, positionsResponse, holdingsResponse, ordersResponse, tradesResponse, instrumentsResponse, readinessResponse, streamResponse, masterResponse] = await Promise.all([
        ApiClient.getExchangeAccount(broker), ApiClient.getBrokerFunds(broker),
        ApiClient.getBrokerPositions(broker), ApiClient.getBrokerHoldings(broker),
        ApiClient.getBrokerOpenOrders(broker), ApiClient.getBrokerTrades(broker),
        ApiClient.getBrokerInstruments(broker), ApiClient.getBrokerReadiness(broker),
        broker === 'flattrade' ? ApiClient.getFlattradeStreamReadiness() : Promise.resolve({ data: null }),
        broker === 'flattrade' ? ApiClient.getFlattradeInstrumentMasterStatus() : Promise.resolve({ data: null }),
      ]);
      if (!accountResponse.ok) throw new Error(accountResponse.error || 'Unable to load broker account.');
      setAccount(accountResponse.data?.account || null);
      setFunds(fundsResponse.data?.funds || null);
      setPositions(positionsResponse.data?.positions || []);
      setHoldings(holdingsResponse.data?.holdings || []);
      setOpenOrders(ordersResponse.data?.orders || []);
      setTrades(tradesResponse.data?.trades || []);
      setInstruments(instrumentsResponse.data?.instruments || []);
      setReadiness(readinessResponse.data?.readiness || null);
      setStreamReadiness(streamResponse.data?.stream || null);
      setInstrumentMasterStatus(masterResponse.data?.status || null);
    } catch (err: any) {
      setError(err?.message || 'Unable to refresh the broker account.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!open) return;
    setMessage(null); setError(null); setValues({});
    void refresh();
  }, [open, broker]);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(null); setMessage(null);
    try {
      const response = await ApiClient.connectExchange({ broker, ...values });
      if (!response.ok) throw new Error(response.error || 'Broker authentication was rejected.');
      setValues({});
      setMessage(`${BROKERS[broker].label} connected for account reconciliation. Execution remains locked until its venue-specific safety gate is completed.`);
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Broker connection failed.');
      setLoading(false);
    }
  };

  const disconnect = async () => {
    setLoading(true); setError(null);
    try {
      const response = await ApiClient.disconnectExchange(broker);
      if (!response.ok) throw new Error(response.error || 'Could not disconnect broker.');
      setAccount(null); setFunds(null); setPositions([]); setHoldings([]); setOpenOrders([]); setTrades([]); setInstruments([]); setReadiness(null); setStreamReadiness(null); setInstrumentMasterStatus(null);
      setMessage(`${BROKERS[broker].label} session was removed.`);
    } catch (err: any) { setError(err?.message || 'Could not disconnect broker.'); }
    finally { setLoading(false); }
  };

  if (!open) return null;
  const config = BROKERS[broker];
  const connected = Boolean(account?.connected);

  return <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
    <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-zinc-200">
      <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-950 text-white">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${config.color} flex items-center justify-center font-bold shadow-md`}>{config.initials}</div>
          <div><h2 className="text-base font-bold">Indian Broker Workspace</h2><p className="text-xs text-zinc-400">Separate account reconciliation and guarded routing</p></div>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex gap-2 p-4 border-b border-zinc-100">
        {(Object.keys(BROKERS) as BrokerId[]).map((id) => <button key={id} type="button" onClick={() => setBroker(id)} className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold border ${broker === id ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200'}`}>{BROKERS[id].label}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}
        {message && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{message}</div>}
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex gap-2"><Lock className="w-4 h-4 shrink-0" /><span><strong>Execution locked.</strong> This connection can reconcile account data but cannot place, modify, or cancel orders. It cannot change the active Upstox or paper-trading mode.</span></div>
        {connected ? <>
          <div className="p-4 rounded-2xl bg-zinc-900 text-white space-y-3"><div className="flex justify-between"><span className="text-xs font-semibold text-emerald-400 flex gap-2"><ShieldCheck className="w-4 h-4" />Connected read-only</span><span className="text-[10px] text-zinc-400">{account?.latencyMs || 0}ms</span></div><div className="grid grid-cols-3 gap-2 text-xs"><div><span className="block text-zinc-400 text-[10px]">Available</span><b>{moneyINR(funds?.availableCash || 0)}</b></div><div><span className="block text-zinc-400 text-[10px]">Used</span><b>{moneyINR(funds?.usedMargin || 0)}</b></div><div><span className="block text-zinc-400 text-[10px]">Equity</span><b>{moneyINR(funds?.totalEquity || 0)}</b></div></div></div>
          <div className="grid grid-cols-3 gap-3"><div className="p-3 rounded-xl border border-zinc-200"><span className="text-[10px] uppercase text-zinc-500">Positions</span><div className="text-2xl font-bold">{positions.length}</div></div><div className="p-3 rounded-xl border border-zinc-200"><span className="text-[10px] uppercase text-zinc-500">Open orders</span><div className="text-2xl font-bold">{openOrders.length}</div></div><div className="p-3 rounded-xl border border-zinc-200"><span className="text-[10px] uppercase text-zinc-500">Trades</span><div className="text-2xl font-bold">{trades.length}</div></div></div>
          <div className="grid grid-cols-2 gap-3"><div className="p-3 rounded-xl border border-zinc-200"><span className="text-[10px] uppercase text-zinc-500">Holdings</span><div className="text-2xl font-bold">{holdings.length}</div></div><div className="p-3 rounded-xl border border-zinc-200"><span className="text-[10px] uppercase text-zinc-500">Catalog</span><div className="text-2xl font-bold">{instruments.length}</div></div></div>
          <p className="text-[11px] text-zinc-500">Readiness: {readiness?.state || 'NOT_CONNECTED'}. Reference catalog entries and every execution action remain disabled until a broker-specific certification is complete.</p>
          {broker === 'flattrade' && <p className="text-[11px] text-zinc-500">Market stream: {streamReadiness?.health || 'DISABLED'} · Scrip master: {instrumentMasterStatus?.isLoaded ? `${instrumentMasterStatus.totalInstruments} verified entries` : 'not imported'}.</p>}
          <div className="flex gap-2"><button type="button" disabled={loading} onClick={() => void refresh()} className="flex-1 py-2.5 rounded-xl bg-zinc-950 text-white text-xs font-semibold flex justify-center gap-2"><RefreshCw className="w-4 h-4" />Refresh</button><button type="button" disabled={loading} onClick={() => void disconnect()} className="px-4 py-2.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-semibold">Disconnect</button></div>
        </> : <form onSubmit={connect} className="space-y-3"><p className="text-xs text-zinc-600">{config.note}</p>{broker === 'flattrade' && <p className="text-xs text-sky-800 bg-sky-50 border border-sky-200 p-3 rounded-xl">Generate the token in <a className="underline font-semibold" href="https://auth.flattrade.in/" target="_blank" rel="noreferrer">Flattrade Pi authorization <ExternalLink className="inline w-3 h-3" /></a>, using the redirect URL registered for your app.</p>}{fields.map(([key, label]) => <label key={key} className="block text-xs font-medium text-zinc-700">{label}<input required value={values[key] || ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} type={key.includes('Token') || key === 'sid' ? 'password' : 'text'} autoComplete="off" className="mt-1.5 w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm" /></label>)}<button disabled={loading} className={`w-full py-2.5 rounded-xl ${config.color} text-white text-xs font-semibold`}>{loading ? 'Verifying...' : `Connect ${config.label}`}</button></form>}
      </div>
    </div>
  </div>;
}
