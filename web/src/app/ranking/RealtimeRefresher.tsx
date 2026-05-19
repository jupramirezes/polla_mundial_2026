'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Suscripción Supabase Realtime: cuando user_scores cambia, hace router.refresh()
 * para que el server vuelva a fetchear y renderizar.
 */
export function RealtimeRefresher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel('user_scores_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_scores' },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
