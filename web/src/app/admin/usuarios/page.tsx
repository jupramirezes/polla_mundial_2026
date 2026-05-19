import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { UsersList } from './UsersList';

export default async function UsuariosPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!me.isAdmin) redirect('/admin');

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, email, phone, is_admin, created_at')
    .order('created_at');

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Usuarios</h1>
            <p className="mt-1 text-sm text-slate-600">
              Promueve o quita el rol de admin. Comparte con un amigo de confianza.
            </p>
          </div>
          <Link href="/admin" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <UsersList
          users={(data ?? []) as Array<{
            id: string; display_name: string; email: string; phone: string | null;
            is_admin: boolean; created_at: string;
          }>}
          currentUserId={me.id}
        />
      </div>
    </main>
  );
}
