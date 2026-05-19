import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { LogoutButton } from './LogoutButton';

export async function Header() {
  let userEmail: string | null = null;
  let displayName: string | null = null;
  let isAdmin = false;
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      userEmail = data.user.email ?? null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, is_admin')
        .eq('id', data.user.id)
        .maybeSingle();
      displayName = profile?.display_name ?? null;
      isAdmin = profile?.is_admin === true;
    }
  } catch {
    // env / db not configured yet
  }

  return (
    <header className="border-b border-emerald-800/30 bg-gradient-to-r from-emerald-700 to-emerald-800 text-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-2xl">⚽</span>
          <span className="hidden sm:inline text-white">Polla Mundial 2026</span>
        </Link>

        {userEmail ? (
          <div className="flex items-center gap-4">
            <Link
              href="/pronosticos"
              className="text-sm font-medium text-white/90 hover:text-white hover:underline"
            >
              Pronósticos
            </Link>
            <Link
              href="/ranking"
              className="text-sm font-medium text-white/90 hover:text-white hover:underline"
            >
              Ranking
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-md bg-amber-400 px-2.5 py-1 text-xs font-bold text-amber-950 hover:bg-amber-300"
              >
                Admin
              </Link>
            )}
            <div className="hidden sm:flex flex-col items-end text-xs leading-tight">
              <span className="font-semibold text-white">{displayName ?? userEmail}</span>
              {displayName && (
                <span className="text-white/70 text-[10px]">{userEmail}</span>
              )}
            </div>
            <LogoutButton />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-white/90 hover:text-white hover:underline"
            >
              Entrar
            </Link>
            <Link
              href="/registro"
              className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-bold text-amber-950 hover:bg-amber-300"
            >
              Crear cuenta
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
