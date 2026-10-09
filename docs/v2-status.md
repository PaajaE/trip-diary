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

## Fáze 1 — nový model (2026-10-09)

Větev `v2/phase-1-model`. Stav: **schéma, veřejné čtení a migrace dat hotové a
otestované**. Zbývá spustit migraci na kopii produkce (brána fáze).

Migrace:

- `20261009120000_v2_core_schema.sql`: typy, `segments`, `moments`, `media`,
  `media_variants`, `places`, `tracks`, `posts`, `post_media`, `tags` (7 pevných
  kategorií), `taggings`. `journeys` rozšířeno o `home_tz` a `cover_media_id`.
  RLS a granty po sloupcích; anon nemá přímý přístup.
- `20261009120100_v2_public_journey.sql`: `get_public_journey(handle, slug)` vrací
  celý strom jedním voláním. Jen veřejné cesty, publikované momenty, hotová média;
  u `hide_location` bez souřadnic.
- `20261009120200_v2_migrate_from_v1.sql`: `v2_migrate_from_v1()` (idempotentní,
  vrací počty, včetně přeskočených a zmrazených dat) a `v2_verify_migration()`.
  Spouští se **ručně** při přepnutí, ne při nasazení.

Rozhodnutí:

- Editoři cesty (`owner|editor`) upravují veškerý obsah cesty, role `member` jen čte.
  Médium bez cesty („inbox“) vidí jen jeho vlastník.
- Smazání cesty média nemaže, jen je odpojí (zůstávají v knihovně vlastníka).
- Moment má příznak `published`: koncepty a soukromé záznamy z v1 se na veřejné
  stránce nezobrazí.
- Čas momentu z v1 se bere z fotek, ne z data zápisu. Nedatované etapy dostanou
  rozsah podle svých momentů; explicitní přiřazení z v1 se zachová přes
  `segment_override_id`.
- Úložné klíče variant zůstávají stejné, při přepnutí se soubory jen zkopírují do R2.
- Srdíčka a komentáře se přesouvají do Fáze 5 (ve v1 prázdné). Veřejné čtení tipů
  (`posts`) přibude také ve Fázi 5.
- `packages/core/public-journey`: Zod schéma výstupu RPC. Test běží nad skutečným
  výstupem z databáze (`fixtures/public-journey.json`).

Ověření:

- `supabase test db`: ✅ 394 testů (z toho 71 nových: `v2_schema_rls`, `v2_migration`)
- `pnpm check` ✅, `pnpm test:packages` ✅, `db:lint` bez nových nálezů, `db:types` přegenerováno

### Brána Fáze 1 — zkouška na kopii produkce (2026-10-09) ✅

Data z produkce načtena jen `SELECT` dotazy (Supabase MCP), nahrána do lokální
databáze a ověřena kontrolními součty (5/5 shodných md5 přes fotky, varianty,
přiřazení, zastávky a záznamy). Texty záznamů nahrazeny zástupným textem, bez
e-mailů a přihlašovacích údajů. Po zkoušce lokální kopie i pomocné soubory smazány.

| Výsledek                   | Hodnota                                        |
| -------------------------- | ---------------------------------------------- |
| `v2_verify_migration()`    | 9/9 kontrol ✅                                 |
| media / varianty           | 56 / 203 (z 252; `preview` = `full`, sloučeno) |
| momenty                    | 5, datum z fotek (Yoho 1.–2. 6. místo 26. 8.)  |
| místa                      | 5 (3 zastávky bez záznamu přeskočeny)          |
| inbox (fotky mimo záznamy) | 7                                              |
| možné duplicity            | 11 skupin                                      |
| `get_public_journey`       | 2,4 ms, 57 kB, 49 médií                        |

Úpravy migrace vynucené reálnými daty:

- v1 `preview` je ve skutečnosti originál (stejné bajty jako `full`) → mapuje se na
  `large` s nižší prioritou než `full`.
- Místa jen ze zastávek, na které odkazuje záznam (ne z holých značek na mapě).
- Výstup hlásí `possible_duplicate_media`.

Datové problémy v produkci (řešit při přepnutí / ve v2 UI):

- Zastávka „Calgary“ má kladnou zeměpisnou délku (114.06 → leží ve Střední Asii).
  Ve v2 se nepřenese.
- Duplicitní fotky: stejné fotky nahrané do více záznamů (např. Rocky Mountains vs.
  inbox a Sálal). Ve v2 nabídnout sloučení duplicit.
- Momenty z v1 se časově překrývají (Sálal, Yoho, Jéje 31. 5.–3. 6.) a jsou
  zamčené (`locked`). Ve Fázi 3 rozhodnout, zda je automatika smí přeskupit.
- Fotky z mezipřistání v Dublinu jsou v momentu „Welcome to Calgary“.
