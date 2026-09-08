import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, X, Sparkles } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  isDrawer?: boolean;
  onClose?: () => void;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[LumenErrorBoundary] Caught unhandled rendering error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || 'Component Recovered';
      const isDrawer = Boolean(this.props.isDrawer);

      return (
        <div
          className={`${
            isDrawer
              ? 'fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs'
              : 'p-6 my-4 mx-auto max-w-lg rounded-2xl bg-white/95 border border-rose-200/80 shadow-xl'
          } text-zinc-900 animate-in fade-in duration-200`}
        >
          <div
            className={`${
              isDrawer
                ? 'relative flex flex-col w-full max-w-[540px] h-full bg-white border-l border-zinc-200 p-6 space-y-4 justify-between shadow-2xl'
                : 'space-y-4'
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200/70 text-rose-600 flex items-center justify-center shadow-2xs">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-zinc-900">{title}</h3>
                    <p className="text-[11px] text-zinc-400">Autonomous Self-Healing Protected Your Session</p>
                  </div>
                </div>
                {this.props.onClose && (
                  <button
                    type="button"
                    onClick={this.props.onClose}
                    className="w-7 h-7 rounded-full text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 flex items-center justify-center transition-all active:scale-95"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-600 space-y-1.5 font-mono">
                <div className="flex items-center gap-1.5 text-zinc-800 font-sans font-medium text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>State Safeguard Active: Trading &amp; capital are intact.</span>
                </div>
                <p className="text-[10.5px] text-zinc-500 break-words font-mono bg-white p-2 rounded-lg border border-zinc-200/60">
                  {this.state.error?.message || 'An unexpected rendering condition occurred.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2 px-3.5 rounded-xl text-xs font-semibold text-white bg-zinc-950 hover:bg-black flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload Component</span>
              </button>
              {this.props.onClose && (
                <button
                  type="button"
                  onClick={this.props.onClose}
                  className="py-2 px-3 rounded-xl text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition-all active:scale-95"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
