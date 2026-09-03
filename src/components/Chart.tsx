import React, { memo, useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, G } from 'react-native-svg';

type Props = { data: number[]; height?: number; stroke?: string; fill?: boolean; style?: ViewStyle };

function toPath(data: number[], width: number, height: number, pad = 3): string {
  if (data.length < 2) return '';
  const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1;
  return data.map((value, index) => {
    const x = pad + (index / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

export const LineChart = memo(function LineChart({ data, height = 180, stroke = '#0A84FF', fill = true, style }: Props) {
  const width = 340;
  const path = useMemo(() => toPath(data, width, height), [data, height]);
  return (
    <View style={[styles.wrap, { height }, style]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity="0.20" />
            <Stop offset="1" stopColor={stroke} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <G>
          {fill && path ? <Path d={`${path} L ${width - 3} ${height} L 3 ${height} Z`} fill="url(#area)" /> : null}
          <Path d={path} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      </Svg>
    </View>
  );
});

export const Sparkline = memo(function Sparkline({ data, height = 34, stroke = '#1FA463' }: Props) {
  return <LineChart data={data} height={height} stroke={stroke} fill={false} />;
});

const styles = StyleSheet.create({ wrap: { width: '100%' } });
