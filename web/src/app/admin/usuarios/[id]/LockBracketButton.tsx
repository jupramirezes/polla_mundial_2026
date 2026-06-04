'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adminLockBracket } from '@/app/pronosticos/clasificados/actions';

export function LockBracketButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handle() {
    if (!confirm('Vas a CONFIRMAR los cruces de este usuario en su nombre. Sus picks de eliminatorias (campeón, sub, 3°, 4°) y su goleador empezarán a contar en el ranking y quedarán bloqueados. ¿Seguro?')) return;
    start(async () => {
      const r = await adminLockBracket(userId);
      if (r.error) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      onClick={handle}
      disabled={pending}
      className="shrink-0 rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
    >
      {pending ? 'Confirmando…' : '🔒 Confirmar cruces de este usuario'}
    </button>
  );
}
