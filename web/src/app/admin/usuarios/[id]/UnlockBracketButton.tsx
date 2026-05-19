'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adminUnlockBracket } from '@/app/pronosticos/clasificados/actions';

export function UnlockBracketButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handle() {
    if (!confirm('Vas a desbloquear el bracket de este usuario. Podrá editar todo (clasificados, top, goleador). ¿Seguro?')) return;
    start(async () => {
      const r = await adminUnlockBracket(userId);
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
      className="shrink-0 rounded bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
    >
      {pending ? 'Desbloqueando…' : 'Desbloquear'}
    </button>
  );
}
