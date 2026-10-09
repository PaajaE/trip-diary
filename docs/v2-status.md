# v2 — stav

Plán: [plan-v2.md](plan-v2.md)

## Fáze 0 — Úklid a ověření předpokladů

| Krok                          | Stav                   | Poznámka                                                                                                                                                                                       |
| ----------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 Úklid                     | ✅ hotovo (2026-10-09) | WIP → `archive/v1-video-wip`, Expo → `archive/expo` a odstraněno z `main`, staré plány → `docs/archive/`, `CLAUDE.md`, pnpm připnuté přes `packageManager`, opraven formát z commitu `6b7f012` |
| 0.2 Testovací dataset         | ⏳ čeká                | Potřebuje export metadat z knihovny fotek (iPhone)                                                                                                                                             |
| 0.3 Spike A — PhotoKit import | ⏳ čeká na iPhone      |                                                                                                                                                                                                |
| 0.4 Spike B — video + R2      | ⏳ čeká                | Část R2 + edge funkce jde udělat bez iPhonu, potřebuje Cloudflare účet                                                                                                                         |
| 0.5 Infrastruktura            | ⏳ čeká                |                                                                                                                                                                                                |

## Ověření

- `pnpm check`: ✅ (116 testovacích souborů, 358 testů + 2 očekávaně selhávající)
- `pnpm test:packages`: ✅
