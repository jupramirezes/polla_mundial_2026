// Genera dos artefactos a partir de scripts/tournament-config.json:
//
//   1. sql/002_seed_tournament.sql    — INSERTs para Supabase (teams, matches, phase_locks)
//   2. docs/Polla-Mundial-2026-Template.xlsx — Excel auto-calculado para participantes
//
// Uso:  cd web && npm run generate:tournament

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT, 'scripts', 'tournament-config.json');
const OUT_SQL = path.join(ROOT, 'sql', '002_seed_tournament.sql');
const OUT_XLSX = path.join(ROOT, 'docs', 'Polla-Mundial-2026-Template.xlsx');

interface Config {
  tournamentName: string;
  startDate: string;
  endDate: string;
  host: string[];
  deadlines: Record<string, string>;
  groups: Record<string, string[]>;
  teamCatalog: Record<string, { name: string; flag: string }>;
}

const cfg: Config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// ===== Helpers de equipos =====

function teamLabel(code: string): string {
  return cfg.teamCatalog[code]?.name ?? code;
}
function teamFlag(code: string): string {
  return cfg.teamCatalog[code]?.flag ?? '';
}
function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

// Genera los 6 partidos de un grupo de 4 (C(4,2) = 6).
function groupMatches(teams: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      out.push([teams[i], teams[j]]);
    }
  }
  return out;
}

// ============================================================
// 1. SQL seed
// ============================================================

const sql: string[] = [];
sql.push('-- =====================================================================');
sql.push(`-- Seed del torneo: ${cfg.tournamentName}`);
sql.push(`-- Generado desde scripts/tournament-config.json`);
sql.push('-- =====================================================================');
sql.push('');

sql.push('-- Equipos');
sql.push('insert into public.teams (code, name, group_letter, flag_emoji) values');
const teamRows: string[] = [];
for (const [letter, teams] of Object.entries(cfg.groups)) {
  for (const code of teams) {
    teamRows.push(
      `  ('${sqlEscape(code)}', '${sqlEscape(teamLabel(code))}', '${letter}', '${teamFlag(code)}')`,
    );
  }
}
sql.push(teamRows.join(',\n') + '\non conflict (code) do nothing;');
sql.push('');

sql.push('-- Partidos de fase de grupos (72)');
sql.push('insert into public.matches (stage, group_letter, external_code, home_team_id, away_team_id) values');
const matchRows: string[] = [];
let matchNum = 1;
for (const [letter, teams] of Object.entries(cfg.groups)) {
  for (const [home, away] of groupMatches(teams)) {
    const code = `G-${letter}-${String(matchNum).padStart(2, '0')}`;
    matchRows.push(
      `  ('group', '${letter}', '${code}', (select id from public.teams where code = '${sqlEscape(home)}'), (select id from public.teams where code = '${sqlEscape(away)}'))`,
    );
    matchNum++;
  }
}
sql.push(matchRows.join(',\n') + '\non conflict (external_code) do nothing;');
sql.push('');

sql.push('-- Partidos de eliminatorias (equipos por determinar al avanzar las rondas)');
const knockoutCounts = { r32: 16, r16: 8, qf: 4, sf: 2, tp: 1, final: 1 } as const;
sql.push('insert into public.matches (stage, external_code) values');
const koRows: string[] = [];
for (const [stage, count] of Object.entries(knockoutCounts)) {
  for (let i = 1; i <= count; i++) {
    const code = `${stage.toUpperCase()}-${String(i).padStart(2, '0')}`;
    koRows.push(`  ('${stage}', '${code}')`);
  }
}
sql.push(koRows.join(',\n') + '\non conflict (external_code) do nothing;');
sql.push('');

sql.push('-- Fechas de cierre de pronósticos');
sql.push('insert into public.phase_locks (phase, locks_at) values');
const lockRows = Object.entries(cfg.deadlines).map(
  ([phase, iso]) => `  ('${phase}', '${iso}')`,
);
sql.push(lockRows.join(',\n') + '\non conflict (phase) do update set locks_at = excluded.locks_at;');
sql.push('');

fs.mkdirSync(path.dirname(OUT_SQL), { recursive: true });
fs.writeFileSync(OUT_SQL, sql.join('\n'));
console.log(`✔  SQL escrito en ${path.relative(ROOT, OUT_SQL)}`);

// ============================================================
// 2. Excel template con auto-cálculo
// ============================================================

type CellValue = string | number | { f: string; v?: string | number; t?: string };
type Row = CellValue[];

const wb = XLSX.utils.book_new();

// ---------- Hoja 1: INSTRUCCIONES ----------
const instr: Row[] = [
  ['POLLA MUNDIAL 2026 — INSTRUCCIONES Y SISTEMA DE PUNTOS'],
  [],
  ['Total a repartir: 1.000 puntos'],
  [],
  ['Categoría', 'Pts c/u', 'Cant.', 'Total'],
  ['Acertar ganador del partido (1X2)', 2, 72, 144],
  ['Bonus marcador exacto (encima del anterior)', 3, 72, 216],
  ['Posición en el grupo: 1°', 4, 12, 48],
  ['Posición en el grupo: 2°', 3, 12, 36],
  ['Posición en el grupo: 3°', 2, 12, 24],
  ['Posición en el grupo: 4°', 1, 12, 12],
  ['Clasificado a dieciseisavos (R32)', 2, 32, 64],
  ['Clasificado a octavos', 3, 16, 48],
  ['Clasificado a cuartos', 6, 8, 48],
  ['Clasificado a semifinales', 12, 4, 48],
  ['Clasificado a la final', 22, 2, 44],
  ['Campeón', 90, 1, 90],
  ['Subcampeón', 60, 1, 60],
  ['Tercer lugar', 40, 1, 40],
  ['Cuarto lugar', 28, 1, 28],
  ['Goleador del mundial', 50, 1, 50],
  ['TOTAL', '', '', 1000],
  [],
  ['Cómo se usa este archivo:'],
  ['  1. Llena tus datos en la hoja JUGADOR.'],
  ['  2. En la hoja FASE_DE_GRUPOS, llena los marcadores de los 72 partidos.'],
  ['     Las tablas de posiciones de cada grupo y la lista de clasificados a R32'],
  ['     (top 2 por grupo) se calculan SOLAS a partir de tus marcadores.'],
  ['  3. Para los 8 cupos extra (mejores 3ros), elige a mano cuáles consideras que'],
  ['     pasan, ayudándote de la tabla de "Terceros candidatos" que se llena sola.'],
  ['  4. En la hoja ELIMINATORIAS llena tus 16 a octavos, 8 a cuartos, 4 a semi y 2 a final.'],
  ['  5. En la hoja TOP_GOLEADOR llena el top 4 final y el goleador.'],
  ['  6. Manda el archivo al admin o súbelo en la web.'],
  [],
  ['Notas de puntuación:'],
  ['• Predecir 2-1 cuando termina 2-1 → 5 pts (2 ganador + 3 marcador exacto)'],
  ['• Predecir 2-1 cuando termina 3-0 → 2 pts (acierta ganador, no marcador)'],
  ['• Las posiciones de grupo y los clasificados se evalúan independientemente.'],
  ['• Si hay empate de goleadores, todos los que predijeron a CUALQUIERA ganan los 50.'],
  [],
  ['Fechas límite de pronósticos:'],
  ...Object.entries(cfg.deadlines).map(([phase, iso]) => [phase, iso] as Row),
];
const ws1 = XLSX.utils.aoa_to_sheet(instr);
ws1['!cols'] = [{ wch: 50 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
XLSX.utils.book_append_sheet(wb, ws1, 'INSTRUCCIONES');

// ---------- Hoja 2: JUGADOR ----------
const jugador: Row[] = [
  ['DATOS DEL JUGADOR'],
  [],
  ['Nombre completo:', ''],
  ['Email:', ''],
  ['Celular:', ''],
];
const ws2 = XLSX.utils.aoa_to_sheet(jugador);
ws2['!cols'] = [{ wch: 22 }, { wch: 45 }];
XLSX.utils.book_append_sheet(wb, ws2, 'JUGADOR');

// ---------- Hoja 3: FASE_DE_GRUPOS (la pieza con auto-cálculo) ----------
//
// Layout por grupo:
//   row+0  "GRUPO X: T1, T2, T3, T4"
//   row+1  headers: # | Local | "vs" | Visitante | GL | GV
//   row+2..row+7  6 partidos
//   row+9  headers: Pos | Equipo | PJ | G | E | P | GF | GC | DG | Pts
//   row+10..row+13  4 equipos (orden config) con fórmulas
//   row+14  separador
//
// Cada bloque ocupa 16 filas.

const groupRows: Row[] = [];
groupRows.push(['FASE DE GRUPOS — 72 PARTIDOS', '', '', '', '', '']);
groupRows.push(['Llena solo las columnas GL (goles local) y GV (goles visitante). El resto se calcula solo.']);
groupRows.push([]);

const BLOCK_HEIGHT = 16;
const BLOCK_START_ROW = groupRows.length; // 0-indexed in array, will be base for cell refs

// Recordamos para cada equipo de cada grupo dónde quedó su fila de standings
const teamCells: Record<string, { row: number /* 1-indexed */; group: string }> = {};

// También recordamos el rango de filas de marcadores por grupo
interface GroupMatchRange { firstRow: number; lastRow: number; }
const groupMatchRanges: Record<string, GroupMatchRange> = {};

const groupOrder = Object.keys(cfg.groups);  // 'A'..'L'

groupOrder.forEach((letter, idx) => {
  const teams = cfg.groups[letter];
  const blockStart = BLOCK_START_ROW + idx * BLOCK_HEIGHT; // 0-indexed in array
  const headerLine = `GRUPO ${letter}: ${teams.map(teamLabel).join(' · ')}`;

  // Asegúrate de que groupRows tenga suficiente longitud antes de escribir
  while (groupRows.length < blockStart + BLOCK_HEIGHT) groupRows.push([]);

  groupRows[blockStart] = [headerLine];
  groupRows[blockStart + 1] = ['#', 'Local', 'vs', 'Visitante', 'GL', 'GV'];

  // Filas de partidos (6 por grupo)
  const matches = groupMatches(teams);
  matches.forEach(([home, away], i) => {
    const matchRowIdx = blockStart + 2 + i;
    groupRows[matchRowIdx] = [
      i + 1,
      teamLabel(home),
      'vs',
      teamLabel(away),
      '',   // GL — usuario llena
      '',   // GV — usuario llena
    ];
  });

  // Rango de partidos en notación Excel (1-indexed). Estas filas son blockStart+2..blockStart+7
  const matchFirst1 = blockStart + 2 + 1; // +1 porque XLSX es 1-indexed
  const matchLast1  = blockStart + 7 + 1;
  groupMatchRanges[letter] = { firstRow: matchFirst1, lastRow: matchLast1 };

  // Standings (4 equipos)
  const standHeaderIdx = blockStart + 9;
  groupRows[standHeaderIdx] = ['Pos', 'Equipo', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Pts'];

  teams.forEach((teamCode, i) => {
    const standRowIdx = blockStart + 10 + i;     // 0-indexed
    const xlRow = standRowIdx + 1;               // 1-indexed para Excel
    teamCells[teamCode] = { row: xlRow, group: letter };

    const teamName = teamLabel(teamCode);
    // Refs a columnas de marcadores en este grupo
    const localCol  = 'B';
    const visitCol  = 'D';
    const glCol     = 'E';
    const gvCol     = 'F';
    const lr        = `${localCol}${matchFirst1}:${localCol}${matchLast1}`;
    const vr        = `${visitCol}${matchFirst1}:${visitCol}${matchLast1}`;
    const gl        = `${glCol}${matchFirst1}:${glCol}${matchLast1}`;
    const gv        = `${gvCol}${matchFirst1}:${gvCol}${matchLast1}`;

    // Refs a columnas de standings para fórmulas de posición (intragrupo)
    const ptsRange = `J${blockStart + 10 + 1}:J${blockStart + 13 + 1}`;
    const dgRange  = `I${blockStart + 10 + 1}:I${blockStart + 13 + 1}`;
    const gfRange  = `G${blockStart + 10 + 1}:G${blockStart + 13 + 1}`;

    // Fórmulas (sin "=" — SheetJS lo agrega al escribir).
    // Filtro de celdas vacías con (cell<>"") para que partidos sin marcador no cuenten.
    const escName = teamName.replace(/"/g, '""');
    const isLoc = `($${localCol}$${matchFirst1}:$${localCol}$${matchLast1}="${escName}")`;
    const isVis = `($${visitCol}$${matchFirst1}:$${visitCol}$${matchLast1}="${escName}")`;
    const glr   = `$${glCol}$${matchFirst1}:$${glCol}$${matchLast1}`;
    const gvr   = `$${gvCol}$${matchFirst1}:$${gvCol}$${matchLast1}`;
    const filled = `(${glr}<>"")*(${gvr}<>"")`;

    const fG  = `SUMPRODUCT(${isLoc}*(${glr}>${gvr})*${filled})+SUMPRODUCT(${isVis}*(${gvr}>${glr})*${filled})`;
    const fE  = `SUMPRODUCT((${isLoc}+${isVis})*(${glr}=${gvr})*${filled})`;
    const fP  = `SUMPRODUCT(${isLoc}*(${glr}<${gvr})*${filled})+SUMPRODUCT(${isVis}*(${gvr}<${glr})*${filled})`;
    const fGF = `SUMPRODUCT(${isLoc}*${glr}*${filled})+SUMPRODUCT(${isVis}*${gvr}*${filled})`;
    const fGC = `SUMPRODUCT(${isLoc}*${gvr}*${filled})+SUMPRODUCT(${isVis}*${glr}*${filled})`;
    const fPJ  = `D${xlRow}+E${xlRow}+F${xlRow}`;
    const fDG  = `G${xlRow}-H${xlRow}`;
    const fPts = `D${xlRow}*3+E${xlRow}`;
    const fPosSimple = `SUMPRODUCT((${ptsRange}>J${xlRow})*1)+SUMPRODUCT((${ptsRange}=J${xlRow})*(${dgRange}>I${xlRow}))+SUMPRODUCT((${ptsRange}=J${xlRow})*(${dgRange}=I${xlRow})*(${gfRange}>G${xlRow}))+1`;

    groupRows[standRowIdx] = [
      { f: fPosSimple, t: 'n' },                  // A: Pos
      teamName,                                    // B: Equipo
      { f: fPJ, t: 'n' },                          // C: PJ
      { f: fG, t: 'n' },                           // D: G
      { f: fE, t: 'n' },                           // E: E
      { f: fP, t: 'n' },                           // F: P
      { f: fGF, t: 'n' },                          // G: GF
      { f: fGC, t: 'n' },                          // H: GC
      { f: fDG, t: 'n' },                          // I: DG
      { f: fPts, t: 'n' },                         // J: Pts
    ];
  });
});

// Sección R32 qualifiers
groupRows.push([]);
groupRows.push(['CLASIFICADOS A R32 — TOP 2 DE CADA GRUPO (calculado automáticamente)']);
groupRows.push(['Grupo', '1° (auto)', '2° (auto)', '3° (candidato, eliges abajo)']);

const r32SectionStartRow = groupRows.length;
groupOrder.forEach((letter) => {
  const teams = cfg.groups[letter];
  // Standings de este grupo: filas (rowOfFirstStand)..(rowOfFirstStand+3)
  const standFirstRow = BLOCK_START_ROW + groupOrder.indexOf(letter) * BLOCK_HEIGHT + 10 + 1; // 1-indexed
  const standLastRow  = standFirstRow + 3;
  const posRange  = `A${standFirstRow}:A${standLastRow}`;
  const nameRange = `B${standFirstRow}:B${standLastRow}`;
  // 1° = team where Pos = 1; 2° = where Pos = 2; 3° = where Pos = 3
  groupRows.push([
    letter,
    { f: `INDEX(${nameRange},MATCH(1,${posRange},0))`, t: 's' },
    { f: `INDEX(${nameRange},MATCH(2,${posRange},0))`, t: 's' },
    { f: `INDEX(${nameRange},MATCH(3,${posRange},0))`, t: 's' },
  ]);
});

// Sección: 8 mejores 3ros - tabla de candidatos con Pts/DG/GF, usuario elige 8
groupRows.push([]);
groupRows.push(['TERCEROS CANDIDATOS — pasan los 8 mejores. Elige a mano 8 marcando "X" en la última columna.']);
groupRows.push(['Grupo', 'Equipo (auto)', 'Pts (auto)', 'DG (auto)', 'GF (auto)', 'Pasa? (X)']);

groupOrder.forEach((letter) => {
  const standFirstRow = BLOCK_START_ROW + groupOrder.indexOf(letter) * BLOCK_HEIGHT + 10 + 1;
  const standLastRow  = standFirstRow + 3;
  const posRange  = `A${standFirstRow}:A${standLastRow}`;
  const nameRange = `B${standFirstRow}:B${standLastRow}`;
  const ptsRange  = `J${standFirstRow}:J${standLastRow}`;
  const dgRange   = `I${standFirstRow}:I${standLastRow}`;
  const gfRange   = `G${standFirstRow}:G${standLastRow}`;
  groupRows.push([
    letter,
    { f: `INDEX(${nameRange},MATCH(3,${posRange},0))`, t: 's' },
    { f: `INDEX(${ptsRange},MATCH(3,${posRange},0))`, t: 'n' },
    { f: `INDEX(${dgRange},MATCH(3,${posRange},0))`, t: 'n' },
    { f: `INDEX(${gfRange},MATCH(3,${posRange},0))`, t: 'n' },
    '',  // usuario marca X
  ]);
});

const ws3 = XLSX.utils.aoa_to_sheet(groupRows as (string | number)[][]);  // cast porque tipos
ws3['!cols'] = [
  { wch: 6 },   // A
  { wch: 22 },  // B (Local/Equipo)
  { wch: 5 },   // C (vs / PJ)
  { wch: 22 },  // D (Visitante / G)
  { wch: 6 },   // E (GL / E)
  { wch: 6 },   // F (GV / P)
  { wch: 6 },   // G (GF)
  { wch: 6 },   // H (GC)
  { wch: 6 },   // I (DG)
  { wch: 6 },   // J (Pts)
];
XLSX.utils.book_append_sheet(wb, ws3, 'FASE_DE_GRUPOS');

// ---------- Hoja 4: ELIMINATORIAS ----------
const elimRows: Row[] = [
  ['ELIMINATORIAS — Predicción de equipos que pasan a cada ronda'],
  ['Llena los nombres de los equipos que crees que clasifican a cada ronda.'],
  ['Para R32 ya tienes la guía de la hoja FASE_DE_GRUPOS (top 2 + 8 mejores 3ros = 32 equipos).'],
  [],
  ['DIECISEISAVOS DE FINAL (R32) — 32 equipos clasificados'],
  ['#', 'Equipo'],
  ...Array.from({ length: 32 }, (_, i) => [i + 1, '']),
  [],
  ['OCTAVOS DE FINAL — 16 equipos clasificados'],
  ['#', 'Equipo'],
  ...Array.from({ length: 16 }, (_, i) => [i + 1, '']),
  [],
  ['CUARTOS DE FINAL — 8 equipos clasificados'],
  ['#', 'Equipo'],
  ...Array.from({ length: 8 }, (_, i) => [i + 1, '']),
  [],
  ['SEMIFINALES — 4 equipos clasificados'],
  ['#', 'Equipo'],
  ...Array.from({ length: 4 }, (_, i) => [i + 1, '']),
  [],
  ['FINAL — 2 equipos clasificados'],
  ['#', 'Equipo'],
  ...Array.from({ length: 2 }, (_, i) => [i + 1, '']),
];
const ws4 = XLSX.utils.aoa_to_sheet(elimRows as (string | number)[][]);
ws4['!cols'] = [{ wch: 6 }, { wch: 30 }];
XLSX.utils.book_append_sheet(wb, ws4, 'ELIMINATORIAS');

// ---------- Hoja 5: TOP_GOLEADOR ----------
const topRows: Row[] = [
  ['POSICIONES FINALES DEL MUNDIAL'],
  [],
  ['1° (Campeón)', ''],
  ['2° (Subcampeón)', ''],
  ['3°', ''],
  ['4°', ''],
  [],
  ['GOLEADOR DEL MUNDIAL'],
  ['Jugador:', ''],
];
const ws5 = XLSX.utils.aoa_to_sheet(topRows as (string | number)[][]);
ws5['!cols'] = [{ wch: 22 }, { wch: 30 }];
XLSX.utils.book_append_sheet(wb, ws5, 'TOP_GOLEADOR');

fs.mkdirSync(path.dirname(OUT_XLSX), { recursive: true });
XLSX.writeFile(wb, OUT_XLSX);
console.log(`✔  Excel escrito en ${path.relative(ROOT, OUT_XLSX)}`);
console.log(`\n✅ Listo. Revisa los archivos generados.`);
