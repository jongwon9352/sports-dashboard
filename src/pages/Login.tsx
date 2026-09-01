import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setInfo('계정이 생성되었습니다. 이메일 인증이 필요할 수 있습니다. 로그인을 시도해주세요.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-secondary bg-surface p-6 shadow-[var(--shadow-2)]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            DH
          </div>
          <div>
            <p className="font-bold text-text-primary leading-tight">대전하나시티즌</p>
            <p className="text-xs text-text-secondary leading-tight">GPS Training Load Dashboard</p>
          </div>
        </div>

        <div className="flex mb-4 rounded-lg bg-surface-secondary p-1 text-sm">
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${mode === 'signin' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-secondary'}`}
            onClick={() => setMode('signin')}
          >
            로그인
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${mode === 'signup' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-secondary'}`}
            onClick={() => setMode('signup')}
          >
            계정 만들기
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">이메일</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">비밀번호</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {info && <p className="text-xs text-emerald-600">{info}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand text-white text-sm font-semibold py-2 disabled:opacity-50"
          >
            {submitting ? '처리 중...' : mode === 'signin' ? '로그인' : '계정 만들기'}
          </button>
        </form>
      </div>
    </div>
  );
}
