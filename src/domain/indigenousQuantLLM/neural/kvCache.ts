/**
 * LUMEN-ASTRA-FIN NEURAL: KEY-VALUE ATTENTION CACHE (KV CACHE)
 * Enables sub-millisecond autoregressive token generation by caching past Key and Value vectors.
 * Eliminates O(T^2) sequence re-computation.
 */

import { Matrix } from './tensor';

export interface LayerKVCache {
  K: Matrix; // [currentSeqLen x dModel]
  V: Matrix; // [currentSeqLen x dModel]
}

export class DynamicKVCache {
  public nLayers: number;
  public maxSeqLen: number;
  public layers: LayerKVCache[];
  public currentLength: number;

  constructor(nLayers: number, maxSeqLen: number = 2048) {
    this.nLayers = nLayers;
    this.maxSeqLen = maxSeqLen;
    this.currentLength = 0;
    this.layers = [];
    for (let l = 0; l < nLayers; l++) {
      this.layers.push({
        K: [],
        V: [],
      });
    }
  }

  /**
   * Appends new Key and Value vectors for a layer, returning the combined cached history.
   */
  public update(layerIdx: number, newK: Matrix, newV: Matrix): { K: Matrix; V: Matrix } {
    const layer = this.layers[layerIdx];
    for (let t = 0; t < newK.length; t++) {
      layer.K.push(newK[t]);
      layer.V.push(newV[t]);
    }
    if (layerIdx === 0) {
      this.currentLength = layer.K.length;
    }
    return { K: layer.K, V: layer.V };
  }

  /**
   * Resets the cache for a new generation prompt.
   */
  public clear(): void {
    this.currentLength = 0;
    for (let l = 0; l < this.nLayers; l++) {
      this.layers[l].K = [];
      this.layers[l].V = [];
    }
  }

  /**
   * Returns current sequence length stored in cache.
   */
  public get length(): number {
    return this.currentLength;
  }
}
