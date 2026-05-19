import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { LogoutButton } from './LogoutButton';

export async function Header() {
  let userEmail: string | null = null;
  let displayName: string | null = null;
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      userEmail = data.user.email ?? null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', data.user.id)
        .maybeSingle();
      displayName = profile?.display_name ?? null;
    }
  } catch {
    // env / db not configured yet
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-2xl">⚽</span>
          <span className="hidden sm:inline">Polla Mundial 2026</span>
        </Link>

        {userEmail ? (
          <div className="flex items-center gap-4">
            <Link href="/pronosticos" className="text-sm font-medium hover:underline">
              Pronósticos
            </Link>
            <Link href="/ranking" className="text-sm font-medium hover:underline">
              Ranking
            </Link>
            <div className="hidden sm:flex flex-col items-end text-xs">
              <span className="font-medium">{displayName ?? userEmail}</span>
              {displayName && <span className="text-slate-500">{userEmail}</span>}
            </div>
            <LogoutButton />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium hover:underline">
              Entrar
            </Link>
            <Link
              href="/registro"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Registro
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
