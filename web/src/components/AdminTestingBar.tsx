'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { autofillMyGroupPredictions } from '@/app/pronosticos/grupos/actions';
import { autofillMyBracket, clearMyBracketPicks } from '@/app/pronosticos/clasificados/actions';

/**
 * Herramientas de testing, SOLO visible para admin.
 * 🧪 BORRAR estas funciones (y este componente) antes de mandar a participantes.
 */
export function AdminTestingBar() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function action(label: string, fn: () => Promise<{ ok?: boolean; error?: string; filled?: number; picks?: number }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) {
        setMsg('❌ ' + r.error);
        return;
      }
      const n = r.filled ?? r.picks;
      setMsg(`✓ ${label}${typeof n === 'number' ? ` (${n})` : ''}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <strong className="text-blue-900 text-sm">🧪 Herramientas de testing (solo admin)</strong>
          <p className="text-xs text-blue-800 mt-0.5">
            Rellena automático tus pronósticos para probar el sistema. Se borran antes de mandar a participantes.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              if (!confirm('Voy a llenar tus 72 pronósticos de fase de grupos con marcadores ALEATORIOS y los voy a GUARDAR (locked). Sobreescribe lo que tengas. ¿Seguro?')) return;
              action('72 marcadores generados', autofillMyGroupPredictions);
            }}
            disabled={pending}
            className="rounded bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            🎲 Llenar grupos
          </button>
          <button
            onClick={() => {
              if (!confirm('Voy a llenar tu bracket completo con picks aleatorios (32 partidos + goleador). Requiere que ya tengas los 72 marcadores de grupos. NO bloquea el bracket. ¿Seguro?')) return;
              action('bracket completo generado', autofillMyBracket);
            }}
            disabled={pending}
            className="rounded bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            🎲 Llenar bracket
          </button>
          <button
            onClick={() => {
              if (!confirm('Voy a borrar TODOS tus picks de bracket + goleador + lock. ¿Seguro?')) return;
              action('bracket borrado', clearMyBracketPicks);
            }}
            disabled={pending}
            className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Borrar bracket
          </button>
        </div>
      </div>
      {msg && (
        <p className={`mt-2 text-xs font-semibold ${msg.startsWith('❌') ? 'text-red-700' : 'text-emerald-700'}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
