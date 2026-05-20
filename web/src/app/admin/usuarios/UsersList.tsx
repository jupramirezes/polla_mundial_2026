'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { setUserAdmin, deleteUser } from './actions';

interface User {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
}

export function UsersList({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(u: User) {
    setError(null);
    setBusyId(u.id);
    start(async () => {
      const r = await setUserAdmin({ userId: u.id, isAdmin: !u.is_admin });
      setBusyId(null);
      if (r.error) setError(r.error);
    });
  }

  function remove(u: User) {
    if (!confirm(
      `Vas a BORRAR completamente a "${u.display_name}" (${u.email}).\n\n` +
      `Esto elimina su cuenta y TODOS sus pronósticos. No se puede deshacer.\n\n` +
      `¿Continuar?`,
    )) return;
    setError(null);
    setBusyId(u.id);
    start(async () => {
      const r = await deleteUser({ userId: u.id });
      setBusyId(null);
      if (r.error) setError(r.error);
    });
  }

  return (
    <div className="mt-6">
      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2 hidden sm:table-cell">Email</th>
              <th className="px-3 py-2 text-center">Admin</th>
              <th className="px-3 py-2 text-center">Predicciones</th>
              <th className="px-3 py-2 text-center">Borrar</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === currentUserId;
              const isBusy = busyId === u.id;
              return (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.display_name}</div>
                    <div className="text-xs text-slate-500 sm:hidden">{u.email}</div>
                    {isMe && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">tú</span>}
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell text-slate-600">{u.email}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggle(u)}
                      disabled={isBusy || pending}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                        u.is_admin
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      } disabled:opacity-50`}
                    >
                      {u.is_admin ? '✓ admin' : 'hacer admin'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Link
                      href={`/admin/usuarios/${u.id}`}
                      className="rounded-md bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
                    >
                      Ver →
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {isMe ? (
                      <span className="text-[10px] text-slate-400">—</span>
                    ) : (
                      <button
                        onClick={() => remove(u)}
                        disabled={isBusy || pending}
                        className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        🗑️
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Los admins pueden cargar resultados oficiales, ver pronósticos de todos y gestionar usuarios.
      </p>
    </div>
  );
}
