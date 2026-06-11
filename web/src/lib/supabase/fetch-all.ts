// Helper para traer TODAS las filas de una consulta, paginando.
//
// Supabase/PostgREST corta en 1000 filas por defecto ("Max rows"). Con 25+
// usuarios, tablas como predictions_matches (hasta 72 filas por usuario) o
// predictions_bracket_winners (32 por usuario) superan ese tope y se truncan
// silenciosamente — rompiendo el scoring y el /resumen. Esto pagina con
// .range() hasta agotar las filas.
//
// Uso:
//   const { data } = await fetchAllRows((from, to) =>
//     supa.from('predictions_matches')
//       .select('user_id, match_id, home_score, away_score')
//       .not('locked_at', 'is', null)
//       .order('user_id').order('match_id')   // orden estable para paginar
//       .range(from, to));

const PAGE_SIZE = 1000;

export async function fetchAllRows<T = Record<string, unknown>>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[] }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('fetchAllRows: error paginando filas:', error.message);
      break;
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break; // última página
  }
  return { data: all };
}
