// Tabla de goleadores EN VIVO del Mundial 2026, leída del módulo de datos
// oficial de Wikipedia (Module:Goalscorers/data/2026 FIFA World Cup), que se
// mantiene durante el torneo. Sin llave, gratis. Se cachea 2h (next.revalidate)
// → se actualiza solo cada ~2 horas, sin cron.

export interface TopScorer {
  rank: number;
  name: string;
  team: string; // bandera + nombre
  goals: number;
}

// Código FIFA de 3 letras → bandera + nombre (los 48 del Mundial 2026).
const TEAM: Record<string, string> = {
  ALG: '🇩🇿 Argelia', ARG: '🇦🇷 Argentina', AUS: '🇦🇺 Australia', AUT: '🇦🇹 Austria',
  BEL: '🇧🇪 Bélgica', BIH: '🇧🇦 Bosnia', BRA: '🇧🇷 Brasil', CPV: '🇨🇻 Cabo Verde',
  CAN: '🇨🇦 Canadá', COL: '🇨🇴 Colombia', COD: '🇨🇩 RD del Congo', CIV: '🇨🇮 Costa de Marfil',
  CRO: '🇭🇷 Croacia', CUW: '🇨🇼 Curazao', CZE: '🇨🇿 Chequia', ECU: '🇪🇨 Ecuador',
  EGY: '🇪🇬 Egipto', ENG: '🏴 Inglaterra', FRA: '🇫🇷 Francia', GER: '🇩🇪 Alemania',
  GHA: '🇬🇭 Ghana', HAI: '🇭🇹 Haití', IRN: '🇮🇷 Irán', IRQ: '🇮🇶 Iraq', JPN: '🇯🇵 Japón',
  JOR: '🇯🇴 Jordania', KOR: '🇰🇷 Corea del Sur', MEX: '🇲🇽 México', MAR: '🇲🇦 Marruecos',
  NED: '🇳🇱 Países Bajos', NZL: '🇳🇿 Nueva Zelanda', NOR: '🇳🇴 Noruega', PAN: '🇵🇦 Panamá',
  PAR: '🇵🇾 Paraguay', POR: '🇵🇹 Portugal', QAT: '🇶🇦 Qatar', KSA: '🇸🇦 Arabia Saudí',
  SCO: '🏴 Escocia', SEN: '🇸🇳 Senegal', RSA: '🇿🇦 Sudáfrica', ESP: '🇪🇸 España',
  SWE: '🇸🇪 Suecia', SUI: '🇨🇭 Suiza', TUN: '🇹🇳 Túnez', TUR: '🇹🇷 Turquía', URU: '🇺🇾 Uruguay',
  USA: '🇺🇸 Estados Unidos', UZB: '🇺🇿 Uzbekistán',
};

const URL = 'https://en.wikipedia.org/w/index.php?title=Module:Goalscorers/data/2026_FIFA_World_Cup&action=raw';

export async function getTopScorers(): Promise<{ scorers: TopScorer[]; error?: string }> {
  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': 'PollaMundial2026/1.0 (polla entre amigos)' },
      next: { revalidate: 7200 }, // 2 horas
    });
    if (!res.ok) return { scorers: [], error: `http-${res.status}` };
    const txt = await res.text();

    // Cada línea: {"[[Jugador]]", "COD", goles }. Las comentadas (--) son placeholders.
    const raw: Array<{ name: string; team: string; goals: number }> = [];
    for (const line of txt.split('\n')) {
      if (line.trim().startsWith('--')) continue;
      const m = line.match(/\{\s*"\[\[([^\]]+)\]\]"\s*,\s*"([A-Z]{2,3})"\s*,\s*(\d+)\s*\}/);
      if (!m) continue;
      const goals = parseInt(m[3], 10);
      if (goals <= 0) continue;
      let name = m[1].replace(/&nbsp;/g, ' ');
      if (name.includes('|')) name = name.split('|').pop() ?? name; // [[Destino|Texto]] → Texto
      raw.push({ name: name.trim(), team: TEAM[m[2]] ?? m[2], goals });
    }
    raw.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
    const scorers = raw.map((s, i) => ({ rank: i + 1, ...s }));
    return { scorers };
  } catch {
    return { scorers: [], error: 'fetch-failed' };
  }
}
