-- =====================================================================
-- 008 — Endurecer profiles RLS contra auto-elevación de privilegios
-- =====================================================================
-- Problema descubierto en auditoría pre-launch:
--   La policy `profiles_update_own` de 001 deja al usuario actualizar
--   CUALQUIER columna de su propia fila, incluyendo:
--     * is_admin   → cualquier usuario podía auto-promoverse a admin
--                    desde la consola del navegador y tomar control total.
--     * bracket_locked_at → cualquier usuario podía borrar su propio
--                    bloqueo de bracket DESPUÉS de ver los grupos
--                    y reescribir sus picks (rompe el anti-trampa).
--
-- Fix: bloquear esas dos columnas vía trigger BEFORE UPDATE. El trigger
-- se salta si la actualización viene del service_role (panel admin o
-- server actions con `getSupabaseAdminClient`), porque service_role
-- siempre tiene rol `service_role` ≠ `authenticated`.
-- =====================================================================

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si la sesión es service_role (admin actions), permitir todo.
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  -- Cualquier intento de cambiar is_admin desde la sesión del usuario → rechazar.
  if new.is_admin is distinct from old.is_admin then
    raise exception 'No autorizado: is_admin solo lo modifica un administrador.';
  end if;

  -- Cualquier intento de mover bracket_locked_at desde la sesión del usuario → rechazar.
  -- (El usuario lo setea vía la función lockBracketWinners que usa service_role.)
  if new.bracket_locked_at is distinct from old.bracket_locked_at then
    raise exception 'No autorizado: el lock del bracket solo lo gestiona el servidor.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_privilege_escalation on public.profiles;
create trigger trg_prevent_profile_privilege_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_profile_privilege_escalation();
