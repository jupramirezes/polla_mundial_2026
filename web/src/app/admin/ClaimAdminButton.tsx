'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { claimAdminIfFirst } from './actions';

export function ClaimAdminButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handle() {
    setError(null);
    start(async () => {
      const r = await claimAdminIfFirst();
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={handle}
        disabled={pending}
        className="rounded-lg bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Reclamando…' : 'Reclamar el rol de admin'}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </>
  );
}
