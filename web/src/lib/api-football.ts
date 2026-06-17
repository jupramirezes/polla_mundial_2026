// Tabla de goleadores EN VIVO desde API-Football (api-sports.io).
// Se cachea 2h (next.revalidate) → se actualiza solo cada ~2 horas sin cron.
//
// Config por variables de entorno:
//   API_FOOTBALL_KEY     (obligatoria) — llave gratis de dashboard.api-football.com
//   API_FOOTBALL_LEAGUE  (opcional, default '1' = Copa del Mundo)
//   API_FOOTBALL_SEASON  (opcional, default '2026')

export interface TopScorer {
  rank: number;
  name: string;
  team: string;
  goals: number;
  photo?: string;
}

interface ApiScorer {
  player?: { name?: string; photo?: string };
  statistics?: Array<{ team?: { name?: string }; goals?: { total?: number | null } }>;
}
interface ApiResponse { response?: ApiScorer[] }

export async function getTopScorers(): Promise<{ scorers: TopScorer[]; error?: string }> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return { scorers: [], error: 'no-key' };

  const league = process.env.API_FOOTBALL_LEAGUE ?? '1';
  const season = process.env.API_FOOTBALL_SEASON ?? '2026';

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/players/topscorers?league=${league}&season=${season}`,
      {
        headers: { 'x-apisports-key': key },
        next: { revalidate: 7200 }, // 2 horas
      },
    );
    if (!res.ok) return { scorers: [], error: `http-${res.status}` };

    const json = (await res.json()) as ApiResponse;
    const scorers: TopScorer[] = (json.response ?? [])
      .map((r, i) => ({
        rank: i + 1,
        name: r.player?.name ?? '—',
        team: r.statistics?.[0]?.team?.name ?? '',
        goals: r.statistics?.[0]?.goals?.total ?? 0,
        photo: r.player?.photo,
      }))
      .filter((s) => s.goals > 0);

    return { scorers };
  } catch {
    return { scorers: [], error: 'fetch-failed' };
  }
}
