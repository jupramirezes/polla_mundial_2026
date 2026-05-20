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

const deleteSchema = z.object({ userId: z.string().uuid() });

/**
 * Borra un usuario por completo: auth.users + cascadea profiles + predictions_*.
 * No deja huella en el ranking. Útil para limpiar cuentas de prueba.
 */
export async function deleteUser(input: z.infer<typeof deleteSchema>) {
  const parsed = deleteSchema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'no autorizado' };
  if (parsed.userId === me.id) return { error: 'No puedes borrarte a ti mismo.' };

  const supa = getSupabaseAdminClient();

  // La tabla admin_overrides referencia profiles SIN cascade (es audit log),
  // así que sus filas bloquearían el delete. Las limpiamos primero.
  await supa.from('admin_overrides').delete().or(`admin_id.eq.${parsed.userId},target_user.eq.${parsed.userId}`);

  // Borra de auth.users → cascade a profiles → cascade a todas las predictions_*
  const { error } = await supa.auth.admin.deleteUser(parsed.userId);
  if (error) return { error: error.message };

  revalidatePath('/admin/usuarios');
  revalidatePath('/admin');
  revalidatePath('/ranking');
  return { ok: true };
}
