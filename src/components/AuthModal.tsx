import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  RotateCw,
  Info,
} from 'lucide-react';
import { useLumen } from '../store';
import { ApiClient } from '../services/apiClient';

type AuthMode = 'social' | 'email_request' | 'email_verify';

export function AuthModal() {
  const {
    authModalOpen,
    closeAuthModal,
    loginWithGoogle,
    loginWithEmail,
    verifyEmailOtp,
  } = useLumen();

  const [mode, setMode] = useState<AuthMode>('social');
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [devTestCode, setDevTestCode] = useState<string | null>(null);
  const [serverOffline, setServerOffline] = useState(false);

  const googleButtonContainerRef = useRef<HTMLDivElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const watchdogTimerRef = useRef<number | null>(null);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Cleanup watchdog timer on unmount
  useEffect(() => {
    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
      }
    };
  }, []);

  // Keyboard navigation: Close on Escape
  useEffect(() => {
    if (!authModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAuthModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authModalOpen, closeAuthModal]);

  // Resend OTP countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Auto-focus OTP input when entering verification mode
  useEffect(() => {
    if (mode === 'email_verify') {
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [mode]);

  // Load Google Identity Services SDK & Render Official Button
  useEffect(() => {
    if (!authModalOpen || mode !== 'social') return;

    let isMounted = true;

    const initGoogleGsi = async () => {
      if (!googleClientId || googleClientId.includes('mock-google-client-id')) return;

      try {
        // Load official GSI script if not present
        if (!(window as any).google?.accounts?.id) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.getElementById('google-gsi-script');
            if (existing) {
              resolve();
              return;
            }
            const script = document.createElement('script');
            script.id = 'google-gsi-script';
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
            document.head.appendChild(script);
          });
        }

        if (!isMounted) return;
        const google = (window as any).google;
        if (!google?.accounts?.id) return;

        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: { credential: string }) => {
            setIsProcessing(true);
            setErrorMessage(null);
            try {
              await loginWithGoogle({ credential: response.credential });
            } catch (err: any) {
              setErrorMessage(err?.message || 'Google authentication failed');
            } finally {
              setIsProcessing(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Mount Google's native button popup renderer
        if (googleButtonContainerRef.current) {
          googleButtonContainerRef.current.innerHTML = '';
          google.accounts.id.renderButton(googleButtonContainerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'left',
            width: 340,
          });
        }
      } catch (err) {
        console.warn('[GSI] Initialization warning:', err);
      }
    };

    initGoogleGsi();

    return () => {
      isMounted = false;
    };
  }, [authModalOpen, mode, googleClientId, loginWithGoogle]);

  // Handle Google button fallback click & One-Tap with fail-safe moment listener
  const handleGooglePromptClick = useCallback(() => {
    setIsProcessing(true);
    setErrorMessage(null);

    // Watchdog: Guarantee UI never hangs indefinitely
    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    watchdogTimerRef.current = setTimeout(() => {
      setIsProcessing(false);
    }, 6000);

    try {
      const google = (window as any).google;
      if (!google?.accounts?.id) {
        if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
        setIsProcessing(false);
        setErrorMessage('Google Identity SDK is still initializing. Please try again or use email sign-in.');
        return;
      }

      google.accounts.id.prompt((notification: any) => {
        if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);

        if (notification.isNotDisplayed()) {
          const reason = notification.getNotDisplayedReason();
          setIsProcessing(false);

          if (reason === 'unrecognized_origin') {
            setErrorMessage(
              `Origin "${window.location.origin}" is not authorized in Google Cloud Console. Please add it under "Authorized JavaScript origins" for Client ID ${googleClientId?.slice(0, 16)}...`
            );
          } else if (reason === 'opt_out_or_no_session') {
            setErrorMessage('No active Google session found. Please click the button below to sign in.');
          } else {
            setErrorMessage(`Google Sign-In was not displayed (${reason}). Please use the official Google button.`);
          }
        } else if (notification.isSkippedMoment() || notification.isDismissedMoment()) {
          setIsProcessing(false);
        }
      });
    } catch (err: any) {
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      setIsProcessing(false);
      setErrorMessage(err?.message || 'Failed to initiate Google sign-in');
    }
  }, [googleClientId]);

  // Step 1: Request 6-digit OTP code to email
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setInfoMessage(null);
    setServerOffline(false);

    try {
      const res = await ApiClient.requestEmailChallenge(cleanEmail);

      if (res.ok) {
        setDevTestCode(res.data?.testCode || null);
        setCountdown(60);
        setInfoMessage(`A 6-digit verification code has been dispatched to ${cleanEmail}`);
        setMode('email_verify');
      } else {
        const errStr = res.error || 'Failed to dispatch verification code';
        if (errStr.includes('Network error') || errStr.includes('Failed to fetch') || errStr.includes('HTTP 404')) {
          setServerOffline(true);
          setErrorMessage('Backend server is currently unreachable. Start it with "npm run server" or continue in Sandbox Mode.');
        } else {
          setErrorMessage(errStr);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error requesting verification challenge');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Verify 6-digit OTP code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = otpInput.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setErrorMessage('Please enter the full 6-digit verification code.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      await verifyEmailOtp(emailInput.trim(), cleanCode, nameInput.trim() || undefined);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Invalid or expired verification code. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Resend OTP code
  const handleResendOtp = async () => {
    if (countdown > 0 || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await ApiClient.requestEmailChallenge(emailInput.trim());
      if (res.ok) {
        setDevTestCode(res.data?.testCode || null);
        setCountdown(60);
        setInfoMessage('A fresh verification code has been dispatched to your email.');
      } else {
        setErrorMessage(res.error || 'Failed to resend code');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error resending code');
    } finally {
      setIsProcessing(false);
    }
  };

  // Offline / Sandbox Fallback
  const handleSandboxLogin = async () => {
    setIsProcessing(true);
    try {
      await loginWithEmail(emailInput.trim(), nameInput.trim() || undefined);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Sandbox login failed');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!authModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
    >
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-200/80 overflow-hidden">
        {/* Obsidian Glass Header Banner */}
        <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6 text-white text-center relative border-b border-white/10">
          <button
            type="button"
            onClick={closeAuthModal}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 mx-auto mb-3 shadow-inner ring-4 ring-indigo-500/10">
            {mode === 'email_verify' ? (
              <KeyRound className="w-6 h-6 text-indigo-400" />
            ) : (
              <Lock className="w-6 h-6 text-indigo-400" />
            )}
          </div>

          <h2 className="text-lg font-black tracking-tight flex items-center justify-center gap-2">
            <span>Enterprise Investor Portal</span>
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto font-medium">
            {mode === 'email_verify'
              ? 'Enter the 6-digit authorization code dispatched to your inbox'
              : mode === 'email_request'
              ? 'Passwordless cryptographic challenge via email OTP'
              : 'Zero-knowledge biometric & OAuth identity synchronization'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50/90 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in slide-in-from-top-1 duration-200">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Informational Message */}
          {infoMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5 animate-in slide-in-from-top-1 duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed font-medium">{infoMessage}</span>
            </div>
          )}

          {/* Dev Test Code Hint */}
          {devTestCode && mode === 'email_verify' && (
            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  <strong>Dev Simulation Code:</strong> {devTestCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOtpInput(devTestCode)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-white px-2 py-1 rounded-md border border-indigo-200 shadow-2xs"
              >
                Auto-fill
              </button>
            </div>
          )}

          {/* Server Offline Notification */}
          {serverOffline && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
              <p className="font-semibold">Backend Offline</p>
              <p className="text-[11px] text-amber-700">
                {import.meta.env.PROD
                  ? 'The backend server is currently unreachable. Trading and authentication are temporarily paused for security.'
                  : 'You are in local development without a connected backend. You can continue in isolated Sandbox Mode.'}
              </p>
              {!import.meta.env.PROD && (
                <button
                  type="button"
                  onClick={handleSandboxLogin}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition-colors shadow-2xs"
                >
                  Continue with Dev Sandbox Login
                </button>
              )}
            </div>
          )}

          {/* MODE 1: Social Login (Google Sign-In) */}
          {mode === 'social' && (
            <div className="space-y-4">
              {/* Native Google Sign-In Button Container */}
              <div className="flex flex-col items-center justify-center min-h-[48px] w-full">
                <div
                  ref={googleButtonContainerRef}
                  id="google-signin-button-container"
                  className="flex justify-center w-full"
                />

                {/* Fallback Custom Google Trigger */}
                <button
                  type="button"
                  onClick={handleGooglePromptClick}
                  disabled={isProcessing}
                  className="mt-2 w-full py-3 px-4 rounded-2xl border border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50/80 text-zinc-800 font-bold text-xs flex items-center justify-center gap-3 transition-all shadow-xs hover:shadow-md disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{isProcessing ? 'Connecting with Google...' : 'Sign in with Google One-Tap'}</span>
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2.5 text-[10px] font-bold text-zinc-400">Or use email</span>
                </div>
              </div>

              {/* Switch to Email OTP */}
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setInfoMessage(null);
                  setMode('email_request');
                }}
                className="w-full py-3 px-4 rounded-2xl border border-zinc-200 hover:border-indigo-300 bg-zinc-50/70 hover:bg-indigo-50/30 text-zinc-800 text-xs font-bold flex items-center justify-center gap-2.5 transition-all shadow-2xs hover:shadow-xs group"
              >
                <Mail className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                <span>Passwordless Email OTP</span>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          )}

          {/* MODE 2: Email Challenge Request */}
          {mode === 'email_request' && (
            <form onSubmit={handleRequestOtp} className="space-y-3 animate-in fade-in duration-150">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Full Name (Optional)</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ritam Saha"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Email Address</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="trader@domain.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || !emailInput.trim()}
                className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
              >
                {isProcessing ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Dispatching OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setInfoMessage(null);
                  setMode('social');
                }}
                className="w-full text-center text-xs text-zinc-500 hover:text-zinc-900 font-semibold pt-1 flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Back to Google Sign-In</span>
              </button>
            </form>
          )}

          {/* MODE 3: Email OTP Verification */}
          {mode === 'email_verify' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-center">
                <p className="text-[11px] text-zinc-500 font-medium">Verification code sent to:</p>
                <p className="text-xs font-bold text-zinc-900 mt-0.5 break-all">{emailInput}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-700 block text-center">
                  Enter 6-Digit Verification Code
                </label>
                <input
                  ref={otpInputRef}
                  type="text"
                  required
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="w-full px-4 py-3 rounded-2xl border border-zinc-200 text-center text-2xl font-mono font-black tracking-[0.5em] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || otpInput.trim().length !== 6}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
              >
                {isProcessing ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify & Access Account</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setInfoMessage(null);
                    setMode('email_request');
                  }}
                  className="text-zinc-500 hover:text-zinc-900 font-medium flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Change Email</span>
                </button>

                {countdown > 0 ? (
                  <span className="text-zinc-400 text-[11px] font-medium">
                    Resend code in {countdown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isProcessing}
                    className="text-indigo-600 hover:text-indigo-800 font-bold text-xs hover:underline flex items-center gap-1"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>Resend Code</span>
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Security & Cryptographic Invariants Footer */}
          <div className="pt-4 border-t border-zinc-100 space-y-2">
            <div className="flex items-start gap-2 text-[11px] text-zinc-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Zero-Knowledge Client Storage:</strong> All private keys and HMAC credentials remain in local browser memory.
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed text-center">
              Secured with AES-256-GCM, ECDSA, and ACID double-entry audit logging.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

