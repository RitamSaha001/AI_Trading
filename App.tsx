import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Dashboard } from './src/components/Dashboard';
import { startMarketFeed } from './src/services/marketFeed';

export default function App() {
  useEffect(() => startMarketFeed(), []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
        <View style={styles.root}><Dashboard /></View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#F4F5F7' }, root: { flex: 1 } });
