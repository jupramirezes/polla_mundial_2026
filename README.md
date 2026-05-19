# Polla Mundial 2026

Web app para hacer la polla de la Copa Mundial FIFA 2026 entre 20 amigos. Pronósticos por web o por Excel (admin sube .xlsx), ranking en vivo, marcadores en eliminatorias.

## Estructura

```
.
├── docs/                          Excel template + Excel original 2022 (archivado)
├── scripts/                       Config del torneo (grupos, fechas, equipos)
├── sql/                           Migraciones SQL para Supabase (en orden)
└── web/                           Aplicación Next.js 16 + Supabase
    ├── src/app/                   Rutas (login, registro, pronósticos, admin, ranking)
    ├── src/lib/scoring/           Sistema de puntos (1.160 pts) + tests
    ├── src/lib/supabase/          Clientes Supabase (browser, server, admin, proxy)
    └── scripts/                   Generador del Excel template + seed SQL
```

## Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind 4
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage)
- **Hosting**: Vercel
- **Excel ingest**: SheetJS (xlsx) para que el admin pueda subir hojas llenadas offline

## Sistema de puntos (1.160 pts total)

| Categoría | Pts | % |
|---|---|---|
| Fase de grupos (marcadores + posiciones) | 480 | 41% |
| Clasificados por ronda (R32→final) | 252 | 22% |
| Marcadores en eliminatorias | 160 | 14% |
| Posiciones finales (top 4) | 218 | 19% |
| Goleador del mundial | 50 | 4% |

Reglas en [web/src/lib/scoring/rules.ts](web/src/lib/scoring/rules.ts).

## Desarrollo local

```bash
cd web
npm install
cp .env.local.example .env.local      # llenar con credenciales Supabase
npm run dev                            # http://localhost:3000
```

### Tests

```bash
cd web
npm test                               # vitest, 32 tests
```

### Regenerar Excel template y seed SQL

Si cambian los grupos del torneo, edita `scripts/tournament-config.json` y:

```bash
cd web
npm run generate:tournament
```

Esto produce:
- `sql/002_seed_tournament.sql` — INSERTs de equipos y partidos
- `docs/Polla-Mundial-2026-Template.xlsx` — Excel auto-calculado para participantes

## Setup de Supabase

1. Crear proyecto en Supabase
2. Aplicar las 3 migraciones de `sql/` en orden (vía SQL Editor o MCP)
3. Copiar URL + anon key + service_role key a `web/.env.local`

## Deploy a Vercel

1. Conectar el repo a Vercel
2. Root directory: `web/`
3. Env vars: las 3 variables de `web/.env.local.example`
