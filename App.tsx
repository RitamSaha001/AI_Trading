import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Dashboard } from './src/components/Dashboard';
import { AICopilot } from './src/components/AICopilot';
import { startMarketFeed } from './src/services/marketFeed';

export default function App() {
  const [copilotOpen, setCopilotOpen] = useState(false);
  useEffect(() => startMarketFeed(), []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
        <View style={styles.root}>
          <Dashboard />
          <Pressable accessibilityRole="button" accessibilityLabel="Open AI Copilot" onPress={() => setCopilotOpen(true)} style={styles.floatingAI}>
            <Text style={styles.floatingText}>✦ AI</Text>
          </Pressable>
          <AICopilot visible={copilotOpen} onClose={() => setCopilotOpen(false)} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#F4F5F7' }, root: { flex: 1 }, floatingAI: { position: 'absolute', right: 18, bottom: 22, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 22, backgroundColor: '#5E5CE6', elevation: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, floatingText: { color: '#FFF', fontWeight: '800' } });
