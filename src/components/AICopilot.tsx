import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Asset } from '../domain/trading';
import { sendCopilotMessage } from '../services/ai';
import { usePortfolioStore } from '../store/portfolio';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

export function AICopilot({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ id: 'welcome', role: 'assistant', text: 'Ask about your positions, risk, or the simulated market. I will ground responses in the current portfolio snapshot.' }]);
  const selected = usePortfolioStore((s) => s.selectedAsset);
  const quick = useMemo(() => [`Risk check for ${selected}`, `Explain ${selected} momentum`, `Suggest a cautious rebalance`], [selected]);

  const submit = useCallback(async (text = input) => {
    const clean = text.trim();
    if (!clean || sending) return;
    const snapshot = usePortfolioStore.getState();
    setInput('');
    setSending(true);
    const id = `${Date.now()}`;
    setMessages((current) => [...current, { id: `${id}-u`, role: 'user', text: clean }]);
    try {
      const reply = await sendCopilotMessage(clean, snapshot, messages.slice(-8), selected);
      setMessages((current) => [...current, { id: `${id}-a`, role: 'assistant', text: reply }]);
    } catch {
      setMessages((current) => [...current, { id: `${id}-e`, role: 'assistant', text: 'Copilot is unavailable right now. The portfolio remains fully usable with local rules.' }]);
    } finally { setSending(false); }
  }, [input, messages, selected, sending]);

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.sheet}>
      <View style={styles.header}><View><Text style={styles.title}>AI Copilot</Text><Text style={styles.subtitle}>Grounded in the simulated portfolio</Text></View><Pressable onPress={onClose} style={styles.close}><Text>×</Text></Pressable></View>
      <FlatList data={messages} keyExtractor={(m) => m.id} contentContainerStyle={styles.messages} renderItem={({ item }) => <View style={[styles.message, item.role === 'user' ? styles.user : styles.assistant]}><Text style={item.role === 'user' ? styles.userText : styles.assistantText}>{item.text}</Text></View>} ListFooterComponent={sending ? <View style={styles.typing}><ActivityIndicator size="small" /><Text style={styles.subtitle}>Thinking…</Text></View> : null} />
      <View style={styles.quickRow}>{quick.map((q) => <Pressable key={q} onPress={() => submit(q)} style={styles.chip}><Text style={styles.chipText}>{q}</Text></Pressable>)}</View>
      <View style={styles.inputRow}><TextInput value={input} onChangeText={setInput} editable={!sending} placeholder="Ask about your portfolio…" style={styles.input} onSubmitEditing={() => submit()} returnKeyType="send"/><Pressable onPress={() => submit()} disabled={sending || !input.trim()} style={[styles.send, (sending || !input.trim()) && styles.disabled]}><Text style={styles.sendText}>↑</Text></Pressable></View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,25,0.26)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', backgroundColor: '#F7F7F9', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E1E4' },
  title: { fontSize: 18, fontWeight: '800', color: '#1D1D1F' }, subtitle: { fontSize: 11, color: '#7A7B82', marginTop: 2 }, close: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#E9EAED', alignItems: 'center', justifyContent: 'center' },
  messages: { paddingVertical: 14, gap: 9 }, message: { maxWidth: '88%', padding: 12, borderRadius: 16 }, assistant: { alignSelf: 'flex-start', backgroundColor: '#FFF' }, user: { alignSelf: 'flex-end', backgroundColor: '#5E5CE6' }, assistantText: { color: '#34343B', fontSize: 13, lineHeight: 19 }, userText: { color: '#FFF', fontSize: 13, lineHeight: 19 }, typing: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10 }, quickRow: { flexDirection: 'row', gap: 7, marginBottom: 10 }, chip: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E3E6', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 }, chipText: { color: '#62646B', fontSize: 10.5, fontWeight: '700' }, inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, input: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E1E2E5', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11 }, send: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5E5CE6' }, disabled: { opacity: 0.45 }, sendText: { color: '#FFF', fontSize: 19, fontWeight: '800' }
});
