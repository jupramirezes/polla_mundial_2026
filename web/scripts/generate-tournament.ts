// Genera dos artefactos a partir de scripts/tournament-config.json:
//
//   1. sql/002_seed_tournament.sql                — INSERTs para Supabase
//   2. docs/Polla-Mundial-2026-Template.xlsx      — Excel auto-calculado (ExcelJS)
//
// Uso:  cd web && npm run generate:tournament

import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';

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

// ===== Helpers =====
function teamLabel(code: string): string { return cfg.teamCatalog[code]?.name ?? code; }
function teamFlag(code: string):  string { return cfg.teamCatalog[code]?.flag ?? ''; }
function sqlEscape(s: string):    string { return s.replace(/'/g, "''"); }

function groupMatches(teams: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++)
      out.push([teams[i], teams[j]]);
  return out;
}

// ============================================================
// 1. SQL seed
// ============================================================

{
  const sql: string[] = [];
  sql.push('-- =====================================================================');
  sql.push(`-- Seed del torneo: ${cfg.tournamentName}`);
  sql.push('-- Generado desde scripts/tournament-config.json');
  sql.push('-- =====================================================================');
  sql.push('');

  sql.push('-- Equipos');
  sql.push('insert into public.teams (code, name, group_letter, flag_emoji) values');
  const teamRows: string[] = [];
  for (const [letter, teams] of Object.entries(cfg.groups))
    for (const code of teams)
      teamRows.push(`  ('${sqlEscape(code)}', '${sqlEscape(teamLabel(code))}', '${letter}', '${teamFlag(code)}')`);
  sql.push(teamRows.join(',\n') + '\non conflict (code) do nothing;\n');

  sql.push('-- Partidos de fase de grupos (72)');
  sql.push('insert into public.matches (stage, group_letter, external_code, home_team_id, away_team_id) values');
  const matchRows: string[] = [];
  let matchNum = 1;
  for (const [letter, teams] of Object.entries(cfg.groups))
    for (const [home, away] of groupMatches(teams)) {
      const code = `G-${letter}-${String(matchNum).padStart(2, '0')}`;
      matchRows.push(`  ('group', '${letter}', '${code}', (select id from public.teams where code = '${sqlEscape(home)}'), (select id from public.teams where code = '${sqlEscape(away)}'))`);
      matchNum++;
    }
  sql.push(matchRows.join(',\n') + '\non conflict (external_code) do nothing;\n');

  sql.push('-- Partidos de eliminatorias (equipos por determinar al avanzar las rondas)');
  const knockoutCounts = { r32: 16, r16: 8, qf: 4, sf: 2, tp: 1, final: 1 } as const;
  sql.push('insert into public.matches (stage, external_code) values');
  const koRows: string[] = [];
  for (const [stage, count] of Object.entries(knockoutCounts))
    for (let i = 1; i <= count; i++)
      koRows.push(`  ('${stage}', '${stage.toUpperCase()}-${String(i).padStart(2, '0')}')`);
  sql.push(koRows.join(',\n') + '\non conflict (external_code) do nothing;\n');

  sql.push('-- Fechas de cierre de pronósticos');
  sql.push('insert into public.phase_locks (phase, locks_at) values');
  sql.push(Object.entries(cfg.deadlines).map(([phase, iso]) => `  ('${phase}', '${iso}')`).join(',\n')
    + '\non conflict (phase) do update set locks_at = excluded.locks_at;\n');

  fs.mkdirSync(path.dirname(OUT_SQL), { recursive: true });
  fs.writeFileSync(OUT_SQL, sql.join('\n'));
  console.log(`✔  SQL escrito en ${path.relative(ROOT, OUT_SQL)}`);
}

// ============================================================
// 2. Excel template con auto-cálculo (ExcelJS)
// ============================================================

// Paleta: 3 colores estándar
const COLORS = {
  header:  'FF1F2937',   // gris oscuro casi negro — secciones, títulos
  input:   'FFFEF3C7',   // amarillo suave — celdas que el usuario llena
  auto:    'FFDBEAFE',   // azul suave — celdas auto-calculadas
  accent:  'FF15803D',   // verde — "PASA" / clasifica
  bad:     'FFB91C1C',   // rojo opcional — eliminados
  light:   'FFF8FAFC',   // gris claro — separadores
} as const;

const wb = new ExcelJS.Workbook();
wb.creator = 'Generador Polla 2026';
wb.created = new Date();

// ---------- Helpers de estilo ----------
function styleHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}
function styleSubHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}
function styleInput(cell: ExcelJS.Cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.input } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = {
    top:    { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right:  { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
}
function styleAuto(cell: ExcelJS.Cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.auto } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.font = { color: { argb: 'FF1E3A8A' } };
}
function styleTeam(cell: ExcelJS.Cell) {
  cell.font = { bold: true };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}
function styleTotalRow(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.light } };
}

// =========================================================
// Hoja 1: INSTRUCCIONES
// =========================================================
{
  const ws = wb.addWorksheet('INSTRUCCIONES', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [{ width: 50 }, { width: 12 }, { width: 12 }, { width: 12 }];

  ws.mergeCells('A1:D1');
  const title = ws.getCell('A1');
  title.value = 'POLLA MUNDIAL 2026 — INSTRUCCIONES Y SISTEMA DE PUNTOS';
  styleHeader(title);
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  ws.getRow(1).height = 28;

  ws.getCell('A3').value = 'Total a repartir: 1.160 puntos';
  ws.getCell('A3').font = { bold: true, size: 12 };

  const headerRow = ['Categoría', 'Pts c/u', 'Cant.', 'Total'];
  ws.getRow(5).values = headerRow;
  headerRow.forEach((_, i) => styleSubHeader(ws.getCell(5, i + 1)));

  const rows = [
    ['Acertar ganador del partido (1X2)', 2, 72, 144],
    ['Bonus marcador exacto (sobre el anterior)', 3, 72, 216],
    ['Posición en el grupo: 1°', 4, 12, 48],
    ['Posición en el grupo: 2°', 3, 12, 36],
    ['Posición en el grupo: 3°', 2, 12, 24],
    ['Posición en el grupo: 4°', 1, 12, 12],
    ['Clasificado a R32 (dieciseisavos)', 2, 32, 64],
    ['Clasificado a octavos',  3, 16, 48],
    ['Clasificado a cuartos',  6,  8, 48],
    ['Clasificado a semis',   12,  4, 48],
    ['Clasificado a la final',22,  2, 44],
    ['Marcador en partidos de eliminatorias (32 partidos)', '2 + 3', 32, 160],
    ['Campeón',     90, 1, 90],
    ['Subcampeón',  60, 1, 60],
    ['Tercer lugar',40, 1, 40],
    ['Cuarto lugar',28, 1, 28],
    ['Goleador del mundial', 50, 1, 50],
  ];
  rows.forEach((r, i) => {
    const rowIdx = 6 + i;
    ws.getRow(rowIdx).values = r;
    if (typeof r[0] === 'string' && r[0].toString().startsWith('Posición')) {
      // sub-items: indentar
      ws.getCell(rowIdx, 1).font = { italic: true };
    }
  });

  const totalRowIdx = 6 + rows.length;
  ws.getRow(totalRowIdx).values = ['TOTAL', '', '', 1160];
  for (let c = 1; c <= 4; c++) styleTotalRow(ws.getCell(totalRowIdx, c));

  let r = totalRowIdx + 2;
  ws.getCell(`A${r}`).value = 'Cómo se usa este archivo:';
  ws.getCell(`A${r}`).font = { bold: true, size: 11 };
  r += 1;
  for (const t of [
    '1. Llena tus datos en la hoja JUGADOR.',
    '2. En FASE_DE_GRUPOS, llena los marcadores de los 72 partidos (celdas amarillas).',
    '   Las tablas de posiciones, R32 clasificados (top 2 + 8 mejores 3ros) se calculan SOLAS.',
    '3. En ELIMINATORIAS, llena los 16 a octavos, 8 a cuartos, 4 a semis y 2 a final.',
    '4. En TOP_GOLEADOR, llena el top 4 final y el goleador.',
    '5. Manda el archivo al admin o súbelo en la web.',
  ]) { ws.getCell(`A${r}`).value = t; r++; }

  r += 1;
  ws.getCell(`A${r}`).value = 'Código de colores:';
  ws.getCell(`A${r}`).font = { bold: true, size: 11 };
  r += 1;
  ws.getCell(`A${r}`).value = '🟡 Amarillo = celdas que TÚ llenas';
  styleInput(ws.getCell(`A${r}`));
  r += 1;
  ws.getCell(`A${r}`).value = '🔵 Azul = celdas auto-calculadas (no las toques)';
  styleAuto(ws.getCell(`A${r}`));
  r += 1;

  r += 1;
  ws.getCell(`A${r}`).value = 'Notas de puntuación:';
  ws.getCell(`A${r}`).font = { bold: true, size: 11 };
  r += 1;
  for (const t of [
    '• Predecir 2-1 cuando termina 2-1 → 5 pts (2 ganador + 3 marcador exacto).',
    '• Predecir 2-1 cuando termina 3-0 → 2 pts (acierta ganador, no marcador).',
    '• En eliminatorias, los puntos por marcador funcionan IGUAL que en grupos.',
    '• Si hay empate de goleadores, todos los que predijeron a cualquiera ganan los 50.',
  ]) { ws.getCell(`A${r}`).value = t; r++; }
}

// =========================================================
// Hoja 2: JUGADOR
// =========================================================
{
  const ws = wb.addWorksheet('JUGADOR');
  ws.columns = [{ width: 25 }, { width: 45 }];

  ws.mergeCells('A1:B1');
  styleHeader(ws.getCell('A1'));
  ws.getCell('A1').value = 'DATOS DEL JUGADOR';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  ws.getRow(1).height = 28;

  ws.getCell('A3').value = 'Nombre completo:';
  ws.getCell('A4').value = 'Email:';
  ws.getCell('A5').value = 'Celular:';
  for (let r = 3; r <= 5; r++) {
    ws.getCell(r, 1).font = { bold: true };
    styleInput(ws.getCell(r, 2));
  }
}

// =========================================================
// Hoja 3: FASE_DE_GRUPOS (la grande)
// =========================================================
{
  const ws = wb.addWorksheet('FASE_DE_GRUPOS', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  ws.columns = [
    { width: 6 },   // A
    { width: 24 },  // B (Local / Equipo)
    { width: 4 },   // C (vs / PJ)
    { width: 24 },  // D (Visitante / G)
    { width: 6 },   // E (GL / E)
    { width: 6 },   // F (GV / P)
    { width: 6 },   // G (GF)
    { width: 6 },   // H (GC)
    { width: 6 },   // I (DG)
    { width: 6 },   // J (Pts)
  ];

  // Intro
  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = 'FASE DE GRUPOS — 72 PARTIDOS';
  styleHeader(ws.getCell('A1'));
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:J2');
  ws.getCell('A2').value = '🟡 Llena solo las columnas GL y GV. 🔵 Las posiciones y clasificados se calculan solos.';
  ws.getCell('A2').font = { italic: true, size: 10 };

  const groupOrder = Object.keys(cfg.groups);
  const BLOCK_HEIGHT = 16;
  const BLOCK_START_ROW = 4;   // 1-indexed

  // Mapea cada equipo a su fila de standings (1-indexed)
  type StandRow = { row: number; group: string };
  const standOf = new Map<string, StandRow>();

  groupOrder.forEach((letter, idx) => {
    const teams = cfg.groups[letter];
    const block = BLOCK_START_ROW + idx * BLOCK_HEIGHT;
    const matchFirst = block + 2;    // 1-indexed first match row
    const matchLast  = block + 7;    // 1-indexed last match row
    const standFirst = block + 10;
    const standLast  = block + 13;

    // Group header (merge A:J)
    ws.mergeCells(block, 1, block, 10);
    const gh = ws.getCell(block, 1);
    gh.value = `GRUPO ${letter}: ${teams.map(teamLabel).join(' · ')}`;
    styleHeader(gh);
    gh.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };

    // Sub-headers de partidos
    const subHeaders = ['#', 'Local', 'vs', 'Visitante', 'GL', 'GV'];
    subHeaders.forEach((v, i) => {
      const c = ws.getCell(block + 1, i + 1);
      c.value = v;
      styleSubHeader(c);
    });

    // Partidos
    const matches = groupMatches(teams);
    matches.forEach(([home, away], i) => {
      const r = block + 2 + i;
      ws.getCell(r, 1).value = i + 1;
      ws.getCell(r, 1).alignment = { horizontal: 'center' };
      ws.getCell(r, 2).value = teamLabel(home);
      ws.getCell(r, 3).value = 'vs';
      ws.getCell(r, 3).alignment = { horizontal: 'center' };
      ws.getCell(r, 4).value = teamLabel(away);
      // GL y GV: input
      styleInput(ws.getCell(r, 5));
      styleInput(ws.getCell(r, 6));
    });

    // Sub-headers de standings
    const standHeaders = ['Pos', 'Equipo', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Pts'];
    standHeaders.forEach((v, i) => {
      const c = ws.getCell(block + 9, i + 1);
      c.value = v;
      styleSubHeader(c);
    });

    // Standings con fórmulas
    teams.forEach((code, i) => {
      const r = standFirst + i;
      const xlRow = r;
      standOf.set(code, { row: xlRow, group: letter });

      const teamName = teamLabel(code);
      const escName = teamName.replace(/"/g, '""');
      const localR = `$B$${matchFirst}:$B$${matchLast}`;
      const visitR = `$D$${matchFirst}:$D$${matchLast}`;
      const glR    = `$E$${matchFirst}:$E$${matchLast}`;
      const gvR    = `$F$${matchFirst}:$F$${matchLast}`;
      const isLoc  = `(${localR}="${escName}")`;
      const isVis  = `(${visitR}="${escName}")`;
      const filled = `(${glR}<>"")*(${gvR}<>"")`;

      // Pts (J), DG (I), GF (G) rangos del grupo (para fórmula de Pos)
      const ptsRange = `J${standFirst}:J${standLast}`;
      const dgRange  = `I${standFirst}:I${standLast}`;
      const gfRange  = `G${standFirst}:G${standLast}`;

      const fG  = `SUMPRODUCT(${isLoc}*(${glR}>${gvR})*${filled})+SUMPRODUCT(${isVis}*(${gvR}>${glR})*${filled})`;
      const fE  = `SUMPRODUCT((${isLoc}+${isVis})*(${glR}=${gvR})*${filled})`;
      const fP  = `SUMPRODUCT(${isLoc}*(${glR}<${gvR})*${filled})+SUMPRODUCT(${isVis}*(${gvR}<${glR})*${filled})`;
      const fGF = `SUMPRODUCT(${isLoc}*${glR}*${filled})+SUMPRODUCT(${isVis}*${gvR}*${filled})`;
      const fGC = `SUMPRODUCT(${isLoc}*${gvR}*${filled})+SUMPRODUCT(${isVis}*${glR}*${filled})`;
      const fPJ  = `D${xlRow}+E${xlRow}+F${xlRow}`;
      const fDG  = `G${xlRow}-H${xlRow}`;
      const fPts = `D${xlRow}*3+E${xlRow}`;
      const fPos = `SUMPRODUCT((${ptsRange}>J${xlRow})*1)+SUMPRODUCT((${ptsRange}=J${xlRow})*(${dgRange}>I${xlRow}))+SUMPRODUCT((${ptsRange}=J${xlRow})*(${dgRange}=I${xlRow})*(${gfRange}>G${xlRow}))+1`;

      // A: Pos
      const aCell = ws.getCell(r, 1);
      aCell.value = { formula: fPos };
      styleAuto(aCell);
      aCell.font = { bold: true, color: { argb: 'FF1E3A8A' } };

      // B: Equipo
      const bCell = ws.getCell(r, 2);
      bCell.value = teamName;
      styleTeam(bCell);

      // Resto: fórmulas auto
      const autoFormulas: Array<[number, string]> = [
        [3, fPJ], [4, fG], [5, fE], [6, fP], [7, fGF], [8, fGC], [9, fDG], [10, fPts],
      ];
      for (const [col, f] of autoFormulas) {
        const c = ws.getCell(r, col);
        c.value = { formula: f };
        styleAuto(c);
        if (col === 10) c.font = { bold: true, color: { argb: 'FF1E3A8A' } };
      }
    });
  });

  // ----- Sección R32 (top 2 + 8 mejores 3ros) -----
  let r = BLOCK_START_ROW + groupOrder.length * BLOCK_HEIGHT + 1;
  ws.mergeCells(r, 1, r, 10);
  ws.getCell(r, 1).value = 'CLASIFICADOS A R32 (auto-calculado)';
  styleHeader(ws.getCell(r, 1));
  ws.getCell(r, 1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  r += 1;

  // Top 2 por grupo
  ws.mergeCells(r, 1, r, 10);
  ws.getCell(r, 1).value = 'Top 2 por grupo (24 equipos)';
  ws.getCell(r, 1).font = { bold: true, size: 11 };
  r += 1;

  const top2HeaderRow = r;
  ['Grupo', '1°', '2°'].forEach((v, i) => {
    const c = ws.getCell(top2HeaderRow, i + 1);
    c.value = v;
    styleSubHeader(c);
  });
  r += 1;

  groupOrder.forEach((letter, idx) => {
    const block = BLOCK_START_ROW + idx * BLOCK_HEIGHT;
    const standFirst = block + 10;
    const standLast  = block + 13;
    const posR  = `A${standFirst}:A${standLast}`;
    const nameR = `B${standFirst}:B${standLast}`;
    ws.getCell(r, 1).value = letter;
    ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 1).alignment = { horizontal: 'center' };
    const c1 = ws.getCell(r, 2);
    c1.value = { formula: `INDEX(${nameR},MATCH(1,${posR},0))` };
    styleAuto(c1);
    const c2 = ws.getCell(r, 3);
    c2.value = { formula: `INDEX(${nameR},MATCH(2,${posR},0))` };
    styleAuto(c2);
    r += 1;
  });

  r += 1;
  ws.mergeCells(r, 1, r, 10);
  ws.getCell(r, 1).value = '8 mejores 3ros — el ranking se hace globalmente por Pts → DG → GF';
  ws.getCell(r, 1).font = { bold: true, size: 11 };
  r += 1;

  const tercerosHeaderRow = r;
  ['Grupo', '3° (auto)', 'Pts', 'DG', 'GF', '¿Pasa?'].forEach((v, i) => {
    const c = ws.getCell(tercerosHeaderRow, i + 1);
    c.value = v;
    styleSubHeader(c);
  });
  r += 1;

  // Filas de los 12 terceros (auto)
  const tercerosFirstRow = r;
  groupOrder.forEach((letter, idx) => {
    const block = BLOCK_START_ROW + idx * BLOCK_HEIGHT;
    const standFirst = block + 10;
    const standLast  = block + 13;
    const posR  = `A${standFirst}:A${standLast}`;
    const nameR = `B${standFirst}:B${standLast}`;
    const ptsR  = `J${standFirst}:J${standLast}`;
    const dgR   = `I${standFirst}:I${standLast}`;
    const gfR   = `G${standFirst}:G${standLast}`;

    ws.getCell(r, 1).value = letter;
    ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 1).alignment = { horizontal: 'center' };

    const cName = ws.getCell(r, 2);
    cName.value = { formula: `INDEX(${nameR},MATCH(3,${posR},0))` };
    styleAuto(cName);

    const cPts = ws.getCell(r, 3);
    cPts.value = { formula: `INDEX(${ptsR},MATCH(3,${posR},0))` };
    styleAuto(cPts);

    const cDg = ws.getCell(r, 4);
    cDg.value = { formula: `INDEX(${dgR},MATCH(3,${posR},0))` };
    styleAuto(cDg);

    const cGf = ws.getCell(r, 5);
    cGf.value = { formula: `INDEX(${gfR},MATCH(3,${posR},0))` };
    styleAuto(cGf);

    // ¿Pasa? — auto: rank entre los 12 terceros, top 8 pasa
    r += 1;
  });
  const tercerosLastRow = r - 1;

  // Llenar columna "¿Pasa?" con fórmulas que usan los rangos completos
  const allPtsR = `C${tercerosFirstRow}:C${tercerosLastRow}`;
  const allDgR  = `D${tercerosFirstRow}:D${tercerosLastRow}`;
  const allGfR  = `E${tercerosFirstRow}:E${tercerosLastRow}`;
  for (let rr = tercerosFirstRow; rr <= tercerosLastRow; rr++) {
    const myPts = `C${rr}`;
    const myDg  = `D${rr}`;
    const myGf  = `E${rr}`;
    // Rank global entre los 12 terceros: cuántos son estrictamente mejores +1
    const rankFormula = `SUMPRODUCT((${allPtsR}>${myPts})*1)+SUMPRODUCT((${allPtsR}=${myPts})*(${allDgR}>${myDg}))+SUMPRODUCT((${allPtsR}=${myPts})*(${allDgR}=${myDg})*(${allGfR}>${myGf}))+1`;
    const passFormula = `IF(${rankFormula}<=8,"✓ PASA","—")`;
    const cell = ws.getCell(rr, 6);
    cell.value = { formula: passFormula };
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center' };
    // Coloreo condicional manual via formula no es directo; aplicamos estilo neutro
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.auto } };
  }

  // Formato condicional: si la celda dice "✓ PASA" → verde, si "—" → gris
  ws.addConditionalFormatting({
    ref: `F${tercerosFirstRow}:F${tercerosLastRow}`,
    rules: [
      {
        type: 'containsText',
        operator: 'containsText',
        text: '✓ PASA',
        priority: 1,
        style: {
          font: { bold: true, color: { argb: 'FFFFFFFF' } },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } },
        },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: '—',
        priority: 2,
        style: {
          font: { color: { argb: 'FF6B7280' } },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.light } },
        },
      },
    ],
  });
}

// =========================================================
// Hoja 4: ELIMINATORIAS (predicción de clasificados por ronda)
// =========================================================
{
  const ws = wb.addWorksheet('ELIMINATORIAS');
  ws.columns = [{ width: 6 }, { width: 32 }];

  ws.mergeCells('A1:B1');
  styleHeader(ws.getCell('A1'));
  ws.getCell('A1').value = 'ELIMINATORIAS — Predicción de clasificados por ronda';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:B2');
  ws.getCell('A2').value = 'Llena los equipos que crees que clasifican a cada ronda. (Los marcadores de cada partido se llenan en VIVO en la web.)';
  ws.getCell('A2').font = { italic: true, size: 10 };

  const sections: Array<[string, number]> = [
    ['DIECISEISAVOS (R32) — 32 equipos', 32],
    ['OCTAVOS — 16 equipos', 16],
    ['CUARTOS — 8 equipos', 8],
    ['SEMIFINALES — 4 equipos', 4],
    ['FINAL — 2 equipos', 2],
  ];

  let r = 4;
  for (const [title, count] of sections) {
    ws.mergeCells(r, 1, r, 2);
    ws.getCell(r, 1).value = title;
    ws.getCell(r, 1).font = { bold: true, size: 11 };
    ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.light } };
    r += 1;

    ws.getCell(r, 1).value = '#';
    ws.getCell(r, 2).value = 'Equipo';
    styleSubHeader(ws.getCell(r, 1));
    styleSubHeader(ws.getCell(r, 2));
    r += 1;

    for (let i = 1; i <= count; i++) {
      ws.getCell(r, 1).value = i;
      ws.getCell(r, 1).alignment = { horizontal: 'center' };
      styleInput(ws.getCell(r, 2));
      r += 1;
    }
    r += 1; // espacio
  }
}

// =========================================================
// Hoja 5: TOP_GOLEADOR
// =========================================================
{
  const ws = wb.addWorksheet('TOP_GOLEADOR');
  ws.columns = [{ width: 22 }, { width: 32 }];

  ws.mergeCells('A1:B1');
  styleHeader(ws.getCell('A1'));
  ws.getCell('A1').value = 'POSICIONES FINALES + GOLEADOR';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  ws.getRow(1).height = 28;

  let r = 3;
  ws.getCell(r, 1).value = 'POSICIONES FINALES DEL MUNDIAL';
  ws.getCell(r, 1).font = { bold: true, size: 12 };
  r += 1;

  const positions: Array<[string, number]> = [
    ['1° (Campeón)', 90],
    ['2° (Subcampeón)', 60],
    ['3°', 40],
    ['4°', 28],
  ];
  for (const [label, pts] of positions) {
    ws.getCell(r, 1).value = `${label}  (${pts} pts)`;
    ws.getCell(r, 1).font = { bold: true };
    styleInput(ws.getCell(r, 2));
    r += 1;
  }

  r += 1;
  ws.getCell(r, 1).value = 'GOLEADOR DEL MUNDIAL';
  ws.getCell(r, 1).font = { bold: true, size: 12 };
  r += 1;
  ws.getCell(r, 1).value = 'Jugador  (50 pts)';
  ws.getCell(r, 1).font = { bold: true };
  styleInput(ws.getCell(r, 2));
}

// Escribir el archivo
async function write() {
  fs.mkdirSync(path.dirname(OUT_XLSX), { recursive: true });
  await wb.xlsx.writeFile(OUT_XLSX);
  console.log(`✔  Excel escrito en ${path.relative(ROOT, OUT_XLSX)}`);
  console.log('\n✅ Listo.');
}
write();
