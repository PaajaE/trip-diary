# Trip Diary

Platforma pro uchování a sdílení cestovních zážitků: mapa, fotky a videa, texty.
Probíhá přestavba na v2 podle [docs/plan-v2.md](docs/plan-v2.md). Plán je závazný:
fáze, brány a rozhodnutí (kap. 9). Stav fází se zapisuje do `docs/v2-status.md`.

## Stack

- Jedna React aplikace (Vite, TanStack Router a Query, Tailwind 4, Dexie, MapLibre)
  pro web i iOS přes Capacitor (`ios/`). Nativní kód jen v tenkých Swift pluginech.
- Sdílené balíčky v `packages/*` (`core` = doména a Zod, `utils`, `api`, `i18n`, …).
  Musí zůstat platformově neutrální (hlídá ESLint).
- Supabase (Postgres + RLS + Auth + edge funkce v `supabase/`). Média v2 → Cloudflare R2.
- Expo app (`apps/mobile`) je odstraněná, archiv ve větvi `archive/expo`.

## Příkazy

- `pnpm check`: formát, lint, typecheck, testy, build (stejně jako CI)
- `pnpm test:packages`: testy sdílených balíčků
- `pnpm db:reset`, `pnpm db:test` (pgTAP), `pnpm db:types` (Docker + Supabase CLI)
- pnpm je připnuté přes `packageManager` (11.5.2), Node 24

## Konvence

- Migrace jsou zdroj pravdy. `src/shared/api/database.types.ts` se jen generuje.
- Striktní TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). Žádné `any`,
  `!` ani plovoucí promises. Externí data validovat Zodem na hranici.
- UI nevolá Supabase přímo, jde přes repozitáře v `entities/*/api`.
- Časy médií: přesný okamžik (UTC) + IANA časové pásmo. Nikdy `new Date()` jako čas zážitku.
- Texty UI česky i anglicky v `packages/i18n`. Názvosloví v2:
  Cesta → Etapa → Výlet → Moment → Fotka/Video, Tip.
- Nové plány a reporty nepřidávat jako další soubory do `docs/`. Aktualizovat
  `plan-v2.md`, případně `v2-status.md`.
