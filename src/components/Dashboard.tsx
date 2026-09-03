import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Asset, ASSETS, computeRisk, indicatorsFromHistory, META, portfolioValue } from '../domain/trading';
import { getAIInsight, AIInsight } from '../services/ai';
import { usePortfolioStore } from '../store/portfolio';
import { LineChart, Sparkline } from './Chart';

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Card = memo(({ children, style }: { children: React.ReactNode; style?: object }) => <View style={[styles.card, style]}>{children}</View>);

const Ticker = memo(({ asset, selected, onSelect }: { asset: Asset; selected: boolean; onSelect: () => void }) => {
  const price = usePortfolioStore((s) => s.prices[asset].current);
  const history = usePortfolioStore((s) => s.prices[asset].history);
  const recent = useMemo(() => history.slice(-20), [history]);
  const ind = useMemo(() => indicatorsFromHistory(recent), [recent]);
  return <Pressable onPress={onSelect} style={[styles.ticker, selected && styles.tickerSelected]}><View style={styles.rowBetween}><View><Text style={styles.tickerSymbol}>{asset}</Text><Text style={styles.muted}>{META[asset].name}</Text></View><Text style={[styles.change, ind.pctChange >= 0 ? styles.positive : styles.negative]}>{ind.pctChange >= 0 ? '+' : ''}{ind.pctChange.toFixed(2)}%</Text></View><Text style={styles.tickerPrice}>{money(price)}</Text><Sparkline data={recent} /></Pressable>;
});

const PositionRow = memo(({ asset, onToggle }: { asset: Asset; onToggle: () => void }) => {
  const held = usePortfolioStore((s) => s.positions[asset]);
  const price = usePortfolioStore((s) => s.prices[asset].current);
  const history = usePortfolioStore((s) => s.prices[asset].history);
  const enabled = usePortfolioStore((s) => s.autoTrade[asset]);
  const recent = useMemo(() => history.slice(-14), [history]);
  const ind = useMemo(() => indicatorsFromHistory(recent), [recent]);
  return <View style={styles.positionRow}><View style={{ flex: 1 }}><Text style={styles.bold}>{asset}</Text><Text style={styles.muted}>{held.toFixed(4)} units</Text></View><View style={styles.valueCol}><Text style={styles.bold}>{money(held * price)}</Text><Text style={[styles.muted, ind.pctChange >= 0 ? styles.positive : styles.negative]}>{ind.pctChange >= 0 ? '+' : ''}{ind.pctChange.toFixed(2)}%</Text></View><View style={{ width: 78 }}><Sparkline data={recent} height={28} /></View><Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled }} onPress={onToggle} style={[styles.toggle, enabled && styles.toggleOn]}><View style={[styles.knob, enabled && styles.knobOn]} /></Pressable></View>;
});

export function Dashboard() {
  const selectedAsset = usePortfolioStore((s) => s.selectedAsset);
  const setSelectedAsset = usePortfolioStore((s) => s.setSelectedAsset);
  const reset = usePortfolioStore((s) => s.resetSimulation);
  const toggleAuto = usePortfolioStore((s) => s.toggleAutoTrade);
  const cash = usePortfolioStore((s) => s.cash);
  const positions = usePortfolioStore((s) => s.positions);
  const prices = usePortfolioStore((s) => s.prices);
  const autoTrade = usePortfolioStore((s) => s.autoTrade);
  const startValue = usePortfolioStore((s) => s.startValue);
  const value = usePortfolioStore((s) => portfolioValue(s));
  const risk = usePortfolioStore((s) => computeRisk(s));
  const selected = prices[selectedAsset];
  const selectedHistory = selected.history;
  const selectedInd = useMemo(() => indicatorsFromHistory(selectedHistory), [selectedHistory]);
  const managedPct = useMemo(() => Math.round(ASSETS.filter((a) => autoTrade[a]).reduce((sum, a) => sum + positions[a] * prices[a].current, 0) / Math.max(value, 1) * 100), [autoTrade, positions, prices, value]);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [amount, setAmount] = useState('0.05');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');

  const refreshAI = useCallback(async () => {
    const snapshot = usePortfolioStore.getState();
    setLoadingAI(true);
    const controller = new AbortController();
    try { setInsight(await getAIInsight(snapshot.selectedAsset, snapshot, controller.signal)); }
    catch { setInsight(null); Alert.alert('AI unavailable', 'Showing local rule-based analysis instead.'); }
    finally { setLoadingAI(false); }
  }, []);
  useEffect(() => { refreshAI(); }, [selectedAsset, refreshAI]);

  const submitOrder = useCallback(() => {
    const result = usePortfolioStore.getState().executeOrder({ side, sym: selectedAsset, amount: Number(amount) });
    if (!result.ok) Alert.alert('Order rejected', result.error ?? 'Unable to place order.');
    else Alert.alert('Order filled', `${side === 'buy' ? 'Bought' : 'Sold'} ${amount} ${selectedAsset}`);
  }, [amount, selectedAsset, side]);

  return <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><View><Text style={styles.brand}>Lumen</Text><Text style={styles.subtitle}>AI trading cockpit</Text></View><Pressable onPress={() => Alert.alert('Demo', 'This is a simulated paper-trading environment.')} style={styles.aiButton}><Text style={styles.aiButtonText}>✦ Ask AI</Text></Pressable></View>
    <View style={styles.heroGrid}><Card style={styles.hero}><Text style={styles.muted}>Total portfolio value</Text><Text style={styles.heroValue}>{money(value)}</Text><View style={styles.row}><Text style={[styles.badge, styles.positiveBg]}>{((value - startValue) / Math.max(startValue, 1) * 100).toFixed(2)}% since start</Text><Text style={[styles.badge, styles.aiBadge]}>AI-managed {managedPct}%</Text></View><LineChart data={prices.BTC.history.slice(-40)} height={120} /></Card><Card style={styles.risk}><Text style={styles.cardTitle}>AI Risk Score</Text><Text style={styles.riskValue}>{risk.score}</Text><Text style={risk.label === 'Conservative' ? styles.positive : risk.label === 'Moderate' ? styles.warning : styles.negative}>{risk.label}</Text><View style={styles.riskTrack}><View style={[styles.riskFill, { width: `${risk.score}%` }]} /></View><Text style={styles.muted}>{Object.entries(risk.weights).sort((a,b)=>b[1]-a[1])[0]?.[0]} is the largest position.</Text></Card></View>
    <Text style={styles.section}>Watchlist</Text><FlatList horizontal data={ASSETS} keyExtractor={(x) => x} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} renderItem={({ item }) => <Ticker asset={item} selected={item === selectedAsset} onSelect={() => setSelectedAsset(item)} />} />
    <Text style={styles.section}>Market · {selectedAsset}/USD</Text><Card><View style={styles.rowBetween}><View><Text style={styles.cardTitle}>{money(selected.current)}</Text><Text style={styles.muted}>{selectedInd.pctChange.toFixed(2)}% over recent window</Text></View><Pressable onPress={refreshAI} disabled={loadingAI} style={styles.smallButton}><Text style={styles.smallButtonText}>{loadingAI ? 'Thinking…' : 'Refresh AI'}</Text></Pressable></View><LineChart data={selectedHistory.slice(-150)} height={220} /></Card>
    <Card style={styles.insight}><View style={styles.rowBetween}><View><Text style={styles.cardTitle}>AI Insight</Text><Text style={styles.muted}>{insight ? `${insight.direction} · ${insight.confidence}% confidence` : 'Local rules · simulated feed'}</Text></View><Text style={styles.spark}>✦</Text></View><Text style={styles.insightText}>{insight?.rationale ?? 'Computing technical signals from the simulated portfolio.'}</Text>{(insight?.signals ?? [{label:'Momentum',value:selectedInd.sma10 !== null && selectedInd.sma30 !== null && selectedInd.sma10 > selectedInd.sma30 ? 'Bullish' : 'Bearish'}, {label:'RSI',value:selectedInd.rsi.toFixed(1)}, {label:'Volatility',value:`${(selectedInd.vol*100).toFixed(2)}%`}]).map((s) => <View key={s.label} style={styles.signal}><Text style={styles.muted}>{s.label}</Text><Text style={styles.bold}>{s.value}</Text></View>)}<Pressable onPress={() => toggleAuto(selectedAsset)} style={styles.strategy}><Text style={styles.strategyText}>{autoTrade[selectedAsset] ? 'Disable auto-trade' : 'Enable auto-trade'} for {selectedAsset}</Text></Pressable></Card>
    <Text style={styles.section}>Positions</Text><Card><FlatList data={ASSETS} keyExtractor={(x) => x} scrollEnabled={false} renderItem={({ item }) => <PositionRow asset={item} onToggle={() => toggleAuto(item)} />} /></Card>
    <Text style={styles.section}>Order ticket</Text><Card><View style={styles.row}><Pressable onPress={() => setSide('buy')} style={[styles.side, side === 'buy' && styles.buyActive]}><Text style={styles.sideText}>Buy</Text></Pressable><Pressable onPress={() => setSide('sell')} style={[styles.side, side === 'sell' && styles.sellActive]}><Text style={styles.sideText}>Sell</Text></Pressable></View><Text style={styles.label}>Amount ({selectedAsset})</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.input} /><Text style={styles.muted}>Cash available {money(cash)} · Estimated total {money(Number(amount || 0) * selected.current)}</Text><Pressable onPress={submitOrder} style={[styles.submit, side === 'sell' && styles.submitSell]}><Text style={styles.submitText}>Review order</Text></Pressable></Card>
    <View style={styles.footer}><Text style={styles.muted}>Simulated paper trading · no real funds · AI output can be wrong and is not financial advice.</Text><Pressable onPress={() => Alert.alert('Reset simulation', 'Reset all positions, orders and simulated prices?', [{text:'Cancel'}, {text:'Reset', style:'destructive', onPress:reset}])}><Text style={styles.reset}>Reset simulation</Text></Pressable></View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40, backgroundColor: '#F4F5F7', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }, brand: { fontSize: 27, fontWeight: '800', color: '#1D1D1F' }, subtitle: { color: '#777980', fontSize: 12, marginTop: 2 }, aiButton: { backgroundColor: '#5E5CE6', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 }, aiButtonText: { color: '#FFF', fontWeight: '700' },
  heroGrid: { gap: 12 }, card: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E5E8' }, hero: { paddingBottom: 10 }, risk: { gap: 6 }, cardTitle: { color: '#1D1D1F', fontWeight: '750', fontSize: 15 }, heroValue: { color: '#1D1D1F', fontSize: 36, fontWeight: '800', marginTop: 4 }, riskValue: { fontSize: 36, fontWeight: '800' }, riskTrack: { height: 7, borderRadius: 7, backgroundColor: '#E9EAED', overflow: 'hidden', marginVertical: 6 }, riskFill: { height: '100%', backgroundColor: '#5E5CE6' }, row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, fontSize: 11, fontWeight: '700', overflow: 'hidden' }, positiveBg: { backgroundColor: '#E8F7EF', color: '#1FA463' }, aiBadge: { backgroundColor: '#EEEFFF', color: '#5E5CE6' }, muted: { color: '#7A7B82', fontSize: 12 }, positive: { color: '#1FA463' }, negative: { color: '#E5484D' }, warning: { color: '#B06B00' }, section: { marginTop: 8, marginBottom: 2, fontSize: 17, fontWeight: '800', color: '#1D1D1F' },
  ticker: { width: 180, backgroundColor: '#FFF', borderRadius: 16, padding: 13, borderWidth: 1, borderColor: '#E7E8EA' }, tickerSelected: { borderColor: '#7D7BEF', borderWidth: 2 }, tickerSymbol: { fontSize: 14, fontWeight: '800' }, tickerPrice: { fontSize: 19, fontWeight: '800', marginVertical: 8 }, change: { fontSize: 11, fontWeight: '800' }, insight: { backgroundColor: '#FAF9FF', borderColor: '#E7E3FF' }, insightText: { color: '#3B3B43', fontSize: 14, lineHeight: 21, marginVertical: 12 }, signal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E7E3FF' }, spark: { color: '#5E5CE6', fontSize: 20 }, strategy: { marginTop: 14, backgroundColor: '#5E5CE6', padding: 12, borderRadius: 12, alignItems: 'center' }, strategyText: { color: '#FFF', fontWeight: '800' }, positionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECECEE' }, bold: { fontWeight: '750', color: '#1D1D1F', fontSize: 13 }, valueCol: { width: 105, alignItems: 'flex-end' }, toggle: { width: 38, height: 23, borderRadius: 20, backgroundColor: '#D9DADD', padding: 2 }, toggleOn: { backgroundColor: '#5E5CE6' }, knob: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#FFF' }, knobOn: { marginLeft: 15 }, side: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#F0F1F2' }, buyActive: { backgroundColor: '#1FA463' }, sellActive: { backgroundColor: '#E5484D' }, sideText: { color: '#FFF', fontWeight: '800' }, label: { fontSize: 12, fontWeight: '700', color: '#6E6E73', marginTop: 14, marginBottom: 6 }, input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E1E4', borderRadius: 11, padding: 12, fontWeight: '700' }, smallButton: { backgroundColor: '#F0EFFF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, smallButtonText: { color: '#5E5CE6', fontWeight: '750', fontSize: 11 }, submit: { marginTop: 12, backgroundColor: '#1FA463', padding: 13, alignItems: 'center', borderRadius: 12 }, submitSell: { backgroundColor: '#E5484D' }, submitText: { color: '#FFF', fontWeight: '800' }, footer: { alignItems: 'center', gap: 10, paddingVertical: 16 }, reset: { color: '#E5484D', fontWeight: '750' }
});