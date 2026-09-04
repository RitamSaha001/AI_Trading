import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { useLumen } from '../store';

export function AuthModal() {
  const {
    authModalOpen,
    closeAuthModal,
    loginWithGoogle,
    loginWithApple,
    loginWithEmail,
    authSession,
  } = useLumen();

  const [mode, setMode] = useState<'social' | 'email'>('social');
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!authModalOpen) return null;

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleGoogleClick = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      if (!googleClientId || googleClientId === 'mock-google-client-id.apps.googleusercontent.com') {
        setErrorMessage('Google Sign-In is not configured. Set VITE_GOOGLE_CLIENT_ID in your .env file.');
        setIsProcessing(false);
        return;
      }

      // Load Google Identity Services script if not already loaded
      if (!(window as any).google?.accounts?.id) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.getElementById('google-gsi-script');
          if (existing) { resolve(); return; }
          const script = document.createElement('script');
          script.id = 'google-gsi-script';
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
          document.head.appendChild(script);
        });
      }

      // Trigger Google One-Tap / Sign-In
      const google = (window as any).google;
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential: string }) => {
          try {
            await loginWithGoogle({ credential: response.credential });
          } catch (err: any) {
            setErrorMessage(err?.message || 'Google sign-in verification failed');
          } finally {
            setIsProcessing(false);
          }
        },
        auto_select: false,
      });
      google.accounts.id.prompt();
      return; // Processing continues in callback
    } catch (err: any) {
      setErrorMessage(err?.message || 'Google sign-in failed');
      setIsProcessing(false);
    }
  };

  const handleAppleClick = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      // Apple Sign-In via official Apple JS SDK
      const appleClientId = import.meta.env.VITE_APPLE_CLIENT_ID;
      if (!appleClientId) {
        setErrorMessage('Apple Sign-In is not configured. Set VITE_APPLE_CLIENT_ID in your .env file.');
        setIsProcessing(false);
        return;
      }

      if (!(window as any).AppleID) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Apple Sign-In SDK'));
          document.head.appendChild(script);
        });
      }

      const AppleID = (window as any).AppleID;
      AppleID.auth.init({
        clientId: appleClientId,
        scope: 'name email',
        redirectURI: window.location.origin + '/auth/apple/callback',
        usePopup: true,
      });

      const response = await AppleID.auth.signIn();
      await loginWithApple({
        identityToken: response.authorization.id_token,
        displayName: response.user?.name?.firstName
          ? `${response.user.name.firstName} ${response.user.name.lastName || ''}`.trim()
          : undefined,
      });
    } catch (e: any) {
      setErrorMessage(e?.message || 'Apple sign-in failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await loginWithEmail(emailInput.trim(), nameInput.trim() || undefined);
    } catch (e: any) {
      setErrorMessage(e?.message || 'Email authentication failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-100 overflow-hidden">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-black p-6 text-white text-center relative">
          <button
            type="button"
            onClick={closeAuthModal}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 mx-auto mb-3 shadow-inner">
            <Lock className="w-6 h-6 text-indigo-400" />
          </div>

          <h2 className="text-xl font-extrabold tracking-tight">Enterprise Investor Portal</h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
            Secure client-side identity & cryptographic ledger synchronization
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {mode === 'social' ? (
            <div className="space-y-3">
              {/* Google Sign In Button */}
              <button
                type="button"
                onClick={handleGoogleClick}
                disabled={isProcessing}
                className="w-full py-3 px-4 rounded-2xl border border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50/80 text-zinc-800 font-bold text-xs flex items-center justify-center gap-3 transition-all shadow-xs hover:shadow-md disabled:opacity-50"
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
                <span>{isProcessing ? 'Authenticating...' : 'Continue with Google'}</span>
              </button>

              {/* Apple Sign In Button */}
              <button
                type="button"
                onClick={handleAppleClick}
                disabled={isProcessing}
                className="w-full py-3 px-4 rounded-2xl bg-black hover:bg-zinc-900 text-white font-bold text-xs flex items-center justify-center gap-3 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-1.99.6-2.63 1.35-.57.65-1.07 1.72-0.93 2.74 1.01.08 2.02-.49 2.64-1.24z" />
                </svg>
                <span>{isProcessing ? 'Authenticating...' : 'Continue with Apple ID'}</span>
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-100" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-[10px] font-bold text-zinc-400">Or use email</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMode('email')}
                className="w-full py-2.5 px-4 rounded-xl border border-zinc-200 text-zinc-600 hover:text-zinc-900 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-zinc-400" />
                <span>Sign in with Email Address</span>
              </button>
            </div>
          ) : (
            /* Direct Email Mode */
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Full Name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ritam Saha"
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Email Address</label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="trader@domain.com"
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{isProcessing ? 'Verifying...' : 'Sign In with Email'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setMode('social')}
                className="w-full text-center text-xs text-indigo-600 hover:text-indigo-800 font-semibold pt-1"
              >
                Back to Social Sign-In
              </button>
            </form>
          )}

          {/* Security & Compliance Footer */}
          <div className="pt-4 border-t border-zinc-100 space-y-2">
            <div className="flex items-start gap-2 text-[11px] text-zinc-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Zero-Knowledge Client Storage:</strong> All private keys and HMAC credentials remain in local browser memory.
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed text-center">
              Compliant with RBI Digital Payment Ombudsman guidelines & NPCI standards.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
