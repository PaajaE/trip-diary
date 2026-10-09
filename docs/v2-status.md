# v2 — stav

Plán: [plan-v2.md](plan-v2.md)

## Fáze 0 — Úklid a ověření předpokladů

| Krok                          | Stav                       | Poznámka                                                                                                                                                                                       |
| ----------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 Úklid                     | ✅ hotovo (2026-10-09)     | WIP → `archive/v1-video-wip`, Expo → `archive/expo` a odstraněno z `main`, staré plány → `docs/archive/`, `CLAUDE.md`, pnpm připnuté přes `packageManager`, opraven formát z commitu `6b7f012` |
| 0.2 Testovací dataset         | ⏳ čeká                    | Potřebuje export metadat z knihovny fotek (iPhone)                                                                                                                                             |
| 0.3 Spike A — PhotoKit import | 🟡 simulátor ✅, iPhone ⏳ | Viz níže. Na iPhonu zbývá ověřit iCloud (originály jen v cloudu), Live Photos, reálné fotky a velkou knihovnu.                                                                                 |
| 0.4 Spike B — video + R2      | ⏳ čeká                    | Část R2 + edge funkce jde udělat bez iPhonu, potřebuje Cloudflare účet                                                                                                                         |
| 0.5 Infrastruktura            | ⏳ čeká                    |                                                                                                                                                                                                |

## Spike A — výsledky v simulátoru (2026-10-09)

Prostředí: iPhone 17 Pro simulátor, iOS 26.5, větev `v2/spike-a-photokit`.
Diagnostika: `tripdiary://app/dev/media-library`.

| Test                                                                      | Výsledek                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 14 testovacích fotek (Calgary → Aljaška, UTC+2 až UTC−8, přes půlnoc UTC) | poloha 18/18, čas 13/13 na sekundu, 0 neshod                            |
| 320 fotek (výkon)                                                         | výpis 48 ms, čtení EXIF všech 0,9 s; poloha 318/318, čas 313/313        |
| Omezený přístup (`limited`)                                               | vidí jen vybrané fotky, u nich poloha i čas správně                     |
| Bez oprávnění                                                             | PhotoKit tiše vrací prázdný seznam → plugin nově vrací `NOT_AUTHORIZED` |
| Fotka bez EXIF offsetu                                                    | PhotoKit použije pásmo zařízení → pravidlo doplněno do plánu (Fáze 2)   |
| Deep link `tripdiary://app/...`                                           | funguje za běhu i při studeném startu                                   |

Další zjištění:

- Na `main` se lokální plugin `PhotoMetadataPlugin` nikdy neregistroval
  (storyboard používal výchozí `CAPBridgeViewController`). Opraveno přes
  `MainViewController`.
- Hlavička aplikace na iOS se překrývá se stavovým řádkem (chybí safe-area
  odsazení). Řešit v novém UI (Fáze 4).

## Ověření

- `pnpm check`: ✅ (118 testovacích souborů, 372 testů + 2 očekávaně selhávající)
- `pnpm test:packages`: ✅

## Landing page: zdroje fotografií

Ilustrační fotky v `public/landing/` jsou z Pexels (licence Pexels, bez povinné
atribuce, bez lidí). Autor je může kdykoli nahradit vlastními.

| Soubor      | Zdroj                                 |
| ----------- | ------------------------------------- |
| `road.webp` | https://www.pexels.com/photo/3266523/ |
| `lake.webp` | https://www.pexels.com/photo/7054237/ |
| `desk.webp` | https://www.pexels.com/photo/7235808/ |
