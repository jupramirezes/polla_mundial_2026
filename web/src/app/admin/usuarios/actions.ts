'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';

const schema = z.object({
  userId: z.string().uuid(),
  isAdmin: z.boolean(),
});

export async function setUserAdmin(input: z.infer<typeof schema>) {
  const parsed = schema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'no autorizado' };

  // Salvavida: no permitir que el último admin se quite a sí mismo
  if (!parsed.isAdmin && parsed.userId === me.id) {
    const supa = getSupabaseAdminClient();
    const { count } = await supa
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_admin', true);
    if ((count ?? 0) <= 1) {
      return { error: 'No te puedes quitar como admin: eres el único. Promueve a otro primero.' };
    }
  }

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('profiles')
    .update({ is_admin: parsed.isAdmin })
    .eq('id', parsed.userId);
  if (error) return { error: error.message };
  revalidatePath('/admin/usuarios');
  revalidatePath('/admin');
  return { ok: true };
}
