import { getSupabaseServerClient } from '@/lib/supabase/server';

/** Devuelve el usuario actual y si es admin, o null si no está autenticado. */
export async function getCurrentUser() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, email, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? '',
    displayName: profile?.display_name ?? null,
    isAdmin: profile?.is_admin === true,
  };
}

/** Cuántos admins existen en total. Útil para el "claim" del primer admin. */
export async function getAdminCount(): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_admin', true);
  return count ?? 0;
}
