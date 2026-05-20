'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { autofillMyGroupPredictions, clearMyGroupPredictions } from '@/app/pronosticos/grupos/actions';
import { autofillMyBracket, clearMyBracketPicks } from '@/app/pronosticos/clasificados/actions';
import { autofillMyKnockoutPredictions, clearMyKnockoutPredictions } from '@/app/pronosticos/eliminatorias/actions';

/**
 * Herramientas de testing — visibles SOLO para admin.
 * 🧪 BORRAR este componente y las acciones que llama antes de mandar a participantes.
 */
export function AdminTestingBar() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  type Result = { ok?: boolean; error?: string; filled?: number; picks?: number };
  function action(label: string, fn: () => Promise<Result>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) { setMsg('❌ ' + r.error); return; }
      const n = r.filled ?? r.picks;
      setMsg(`✓ ${label}${typeof n === 'number' ? ` (${n})` : ''}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 p-3 space-y-3">
      <div>
        <strong className="text-blue-900 text-sm">🧪 Herramientas de testing (solo admin)</strong>
        <p className="text-xs text-blue-800 mt-0.5">
          Rellena/borra automático tus pronósticos para probar el sistema. Se borran antes de mandar a participantes.
        </p>
      </div>

      {/* Fila 1: Llenar */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs font-semibold text-blue-900 self-center w-16">Llenar:</span>
        <button
          onClick={() => {
            if (!confirm('Voy a llenar tus 72 marcadores de grupos con valores aleatorios + locked. ¿Seguro?')) return;
            action('grupos generados', autofillMyGroupPredictions);
          }}
          disabled={pending}
          className="rounded bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          🎲 Grupos
        </button>
        <button
          onClick={() => {
            if (!confirm('Voy a llenar tu bracket completo (R32→Final + goleador) con picks aleatorios. Requiere grupos ya llenos. ¿Seguro?')) return;
            action('bracket generado', autofillMyBracket);
          }}
          disabled={pending}
          className="rounded bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          🎲 Bracket
        </button>
        <button
          onClick={() => {
            if (!confirm('Voy a llenar tus marcadores de eliminatorias con valores aleatorios + locked. Requiere cruces ya asignados por admin. ¿Seguro?')) return;
            action('marcadores KO generados', autofillMyKnockoutPredictions);
          }}
          disabled={pending}
          className="rounded bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          🎲 KO
        </button>
      </div>

      {/* Fila 2: Borrar */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs font-semibold text-red-900 self-center w-16">Borrar:</span>
        <button
          onClick={() => {
            if (!confirm('Voy a borrar TODOS tus pronósticos de grupos. ¿Seguro?')) return;
            action('grupos borrados', clearMyGroupPredictions);
          }}
          disabled={pending}
          className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Grupos
        </button>
        <button
          onClick={() => {
            if (!confirm('Voy a borrar TUS picks de bracket + goleador + el lock. ¿Seguro?')) return;
            action('bracket borrado', clearMyBracketPicks);
          }}
          disabled={pending}
          className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Bracket
        </button>
        <button
          onClick={() => {
            if (!confirm('Voy a borrar TUS marcadores predichos de eliminatorias. ¿Seguro?')) return;
            action('marcadores KO borrados', clearMyKnockoutPredictions);
          }}
          disabled={pending}
          className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          KO
        </button>
      </div>

      {msg && (
        <p className={`text-xs font-semibold ${msg.startsWith('❌') ? 'text-red-700' : 'text-emerald-700'}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
