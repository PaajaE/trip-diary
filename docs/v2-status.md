# v2 — stav

Plán: [plan-v2.md](plan-v2.md)

## Fáze 0 — Úklid a ověření předpokladů

| Krok                          | Stav                                 | Poznámka                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 Úklid                     | ✅ hotovo (2026-10-09)               | WIP → `archive/v1-video-wip`, Expo → `archive/expo` a odstraněno z `main`, staré plány → `docs/archive/`, `CLAUDE.md`, pnpm připnuté přes `packageManager`, opraven formát z commitu `6b7f012` |
| 0.2 Testovací dataset         | ⏳ čeká                              | Potřebuje export metadat z knihovny fotek (iPhone)                                                                                                                                             |
| 0.3 Spike A — PhotoKit import | 🟡 simulátor ✅, iPhone ✅ na vzorku | Viz níže. Na iPhonu ověřeno na 50 oblíbených (poloha, čas, offset, iCloud). Zbývá: videa, Live Photos zvlášť, celá velká knihovna.                                                             |
| 0.4 Spike B — video + R2      | ⏳ čeká                              | Část R2 + edge funkce jde udělat bez iPhonu, potřebuje Cloudflare účet                                                                                                                         |
| 0.5 Infrastruktura            | ⏳ čeká                              |                                                                                                                                                                                                |

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

## Spike A — výsledky na iPhonu (2026-10-09)

Zařízení: iPhone 13 mini, iOS 26.4.2, ladicí build `cz.tripdiary.app` nainstalovaný přes `xcodebuild` + `devicectl`.
Vzorek: **50 oblíbených** položek rovnoměrně rozložených přes knihovnu (37 fotek, 13 videí). Diagnostika: `tripdiary://app/dev/media-library`.

| Měření                        | iCloud vypnutý | iCloud zapnutý (jen vzorek) |
| ----------------------------- | -------------- | --------------------------- |
| Fotky s porovnaným časem      | 3              | **35 z 37**, 0 neshod       |
| Fotky s porovnanou polohou    | 3              | **32**, 0 neshod            |
| Fotky s EXIF offsetem         | 3              | 35                          |
| Položky s polohou v PhotoKitu | 42 z 50        | 42 z 50                     |
| `metadataErrors`              | 0              | 0                           |
| Čtení metadat vzorku          | 0,3 s          | 43,8 s (asi 1,2 s na fotku) |
| Výpis celé knihovny           | 3,1 s          | 3,1 s                       |

Závěry:

- Bez iCloudu se EXIF přečetl jen u 3 fotek, takže většina originálů je jen v cloudu; s iCloudem se načetl u 35 z 37. Čtení EXIF z iCloud-only originálů tedy funguje a PhotoKit čas i poloha sedí s EXIF (0 neshod).
- 2 z 37 fotek nemají porovnatelný čas ani offset (pravděpodobně bez EXIF data, např. screenshoty); nezjišťováno.
- Import musí počítat se stahováním originálů: asi 1,2 s na fotku při souběhu 4.

Neověřeno: videa (13 z 50 se nečetla), Live Photos zvlášť, celá knihovna (velikost a čas výpisu jsou jen z vzorku 50), mobilní data.

## Video z iPhonu — výsledky (2026-10-09)

Zařízení: iPhone 13 mini, iOS 26.4.2, ladicí build. Dev stránka `/dev/video-upload` (jen nativní aplikace).

| Měření                                        | Výsledek                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Export svislého videa 19,1 s                  | 3,8 s, výstup 1080×1920 (orientace zachována), 32,5 MB, poster 720×1280 98 kB       |
| Upload do produkčního R2 (background session) | 100 %, 32 539 146 B; řádky `media` (`ready`) a `media_variants` (`video`, `poster`) |
| Veřejný soubor                                | 200, `video/mp4`, `accept-ranges: bytes`, H.264 + AAC, `moov` na začátku            |
| Úklid (`delete-media` + smazání řádku)        | DB 0 řádků, R2 objekty pryč; Cloudflare cache dál servíruje starou kopii            |

Výpadek sítě (2026-10-10, 32,6 s, 62 MB, opakovaně letadlový režim): upload po obnovení sítě sám dokončen. Export přepsán s cílem 8 Mb/s: 42,8 s video → 43,6 MB (1920×1080), export 8,2 s. Neověřeno: upload nového exportu, HDR a 4K60 HEVC, přehrání v Chrome a Firefoxu, obnovení po zabití aplikace.

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

## Fáze 3 — automatika (2026-10-09, rozpracováno)

Větev `v2/phase-3-automation`. Čisté funkce v `@trip-diary/core/automation`
(bez databáze, běží v prohlížeči, aplikaci i edge funkcích), 72 testů.

| Funkce                                                                                        | Stav | Ověření                                                               |
| --------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------- |
| `clusterMoments` (pauza 90 min, skok 1,5 km, zamčené momenty, stabilní kotva)                 | ✅   | anonymizovaný reálný vzorek (56 fotek, 9 dní) + syntetika             |
| `findDuplicateGroups` (±1 s, ≤ 10 m)                                                          | ✅   | 12 skupin ve vzorku                                                   |
| `summarizeDays` (místní den v pásmu cesty)                                                    | ✅   | fotka ve 23:30 Whitehorse                                             |
| `suggestStageBoundaries` (posun těžiště dne ≥ 80 km)                                          | ✅   | Dublin → Calgary, Calgary → Rockies                                   |
| `suggestTrips` (základna, den / trek / přesun)                                                | ✅   | Moraine Lake (den), 6denní Magog (trek), Whitehorse → Dawson (přesun) |
| `resolveCaptureZone`, `wallClockToInstant` (pásmo z GPS, offline `@photostructure/tz-lookup`) | ✅   | Yoho = `America/Edmonton`, Skagway = `America/Juneau`, DST            |
| `summarizeTrack`, `parseGpxTrackPoints`, `deriveTrackFromMedia`                               | ✅   | vzdálenost, převýšení, Douglas–Peucker                                |
| Místa (reverzní geokódování, edge funkce + cache v `places`)                                  | ⏳   | —                                                                     |

Poznámky:

- Vzorek z produkce je ručně vybraných 56 fotek, proto vychází hodně
  jednofotkových momentů. Při importu celé knihovny budou momenty hustší;
  duplicity se musí odstranit před shlukováním.
- Brána fáze (≥ 90 % médií ve správném výletu) potřebuje celou knihovnu z
  Kanady s ručně označenými výlety — po zprovoznění importu na iPhonu.
- Testovací data: souřadnice posunuté o konstantu, syntetická ID (repozitář je
  veřejný).

### Názvy míst — rozhodnutí

- **Mapy.com nelze**: podmínky zakazují ukládat výsledky API (čl. 4.6.2).
- **OSM Nominatim** (rozhodnuto 2026-10-09) podle
  [zásad použití](https://operations.osmfoundation.org/policies/nominatim/):
  max 1 požadavek/s za celou aplikaci (`claim_geocoder_slot`), vlastní User-Agent,
  povinné ukládání výsledků (`place_lookups`, `places.source_ref`), jen použití
  vyvolané uživatelem při mírném počtu uživatelů. Při otevření veřejnosti přejít
  na vlastní instanci nebo placenou službu.
- **Atribuce**: všude, kde se zobrazují názvy míst, uvést „© OpenStreetMap
  contributors“ (Fáze 4/5).
- Volat jen pro momenty bez místa (ne pro každou fotku).

## Cloudflare R2 (2026-10-09)

- Bucket `trip-diary-media` vytvořen (ENAM, Standard). Doména `cestovni-denik.cz`
  je na Cloudflare DNS.
- Zbývá v dashboardu: CORS (JSON v konverzaci), vlastní doména
  `media.cestovni-denik.cz`, R2 API token (Object Read & Write na bucket) →
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` do
  Supabase secrets.

## Fáze 2 — nahrávání (2026-10-09, rozpracováno)

Větev `v2/phase-2-upload` (nad Fází 3).

- R2: CORS ověřen (`https://cestovni-denik.cz` dostane hlavičky, cizí původ ne),
  `media.cestovni-denik.cz` odpovídá přes Cloudflare.
- **Rozhodnutí 2026-10-09: čtení médií přes veřejné, neuhodnutelné URL**
  (`<userId>/<mediaId>/<kind>.<ext>` na `media.cestovni-denik.cz`). Ve v1 byl
  bucket soukromý; při potřebě lze doplnit Cloudflare Worker s podpisy.
- `media-upload` edge funkce: podepsaný PUT pro varianty fotek (Content-Type v
  podpisu, max 20 MB), multipart pro video (díly 8 MB, max 120 MB), klíče jen ve
  složce přihlášeného uživatele. Čistá logika v `_shared/media/upload.ts`,
  testy v `@trip-diary/core` (`media-upload`).
- Zbývá: ověřit proti skutečnému R2, web klient (zpracování fotek z PC →
  varianty → upload → záznam v `media`), iOS nativní pipeline (iPhone).

## Fáze 4 — owner UI (2026-10-12, rozpracováno)

Větev `v2/phase-4-owner-ui`, PR #9. Vše níže je v kódu a prošlo `pnpm check`; ověření
proti lokální DB / skutečné knihovně je uvedeno u každé položky.

| Část                                                                            | Stav                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pracovní plocha `/j/$journeyId/workspace`: časová osa + mapa                    | ✅ ověřeno v prohlížeči na lokálních datech                                                                                                                                                                                                                        |
| Hvězdička, obálky (cesta/etapa/výlet/moment), popisky                           | ✅ testy + prohlížeč                                                                                                                                                                                                                                               |
| Přijmout/zamítnout návrh etapy, sloučit/rozdělit moment, posun předělu          | ✅ atomické RPC `merge_moments`, `split_moment`, `move_segment_boundary` (pgTAP 37 testů), UI s Undo (sloučení Undo nemá)                                                                                                                                          |
| Editor textů (etapa, výlet, moment)                                             | ✅ testy                                                                                                                                                                                                                                                           |
| „Uspořádat automaticky“ (`planOrganization`)                                    | ✅ lokálně; ručně upravené a zamknuté momenty a přijaté/zamítnuté etapy se nepřepisují. Omezení: názvy přeskupených automatických momentů se neřeší, přesuny médií jsou sekvenční, atomický dávkový RPC chybí                                                      |
| Import s trvalou frontou (web: soubory; iOS: PhotoKit) `/j/$journeyId/import`   | ✅ web proti lokální DB + reálnému R2 (4 fotky, opakovaný běh nic nezdvojí, EXIF čas/GPS správně). ⚠️ UNVERIFIED: cesta PhotoKit → `exportPhoto` → fronta na iPhonu (zařízení bylo offline). HEIC a videa v prohlížeči se přeskočí (`web_video_unsupported`)       |
| Štítky momentů: kategorie, volné, druhy (GBIF `species/suggest`)                | ✅ UI testy; RLS/granty ověřeny skriptem proti lokální DB (vlastní i cizí uživatel, duplicity 23505). Štítky jen na momentech; média a tipy (DB to umí) zatím bez UI. Prohlížečový průchod nebyl možný (vestavěný prohlížeč bez nástrojů), pokryto testy komponent |
| Tipy `/tips` (`posts` kind `tip`): seznam, vytvořit, upravit, smazat, zveřejnit | ✅ testy + skript proti lokální DB (RLS: cizí uživatel nezapíše, neupraví, nesmaže). Veřejné zobrazení tipů je Fáze 5                                                                                                                                              |
| Rychlý zápis `/j/$journeyId/quick`                                              | ✅ testy + vložení do lokální DB. Okamžitý moment (manuální, zamčený) s polohou, koncept v `localStorage`; **bez offline fronty** (při chybě text zůstane, uložit jde znovu). ⚠️ UNVERIFIED: geolokace na iPhonu                                                   |

Dokončeno 2026-10-14 (IMPLEMENTED, `pnpm check` zelené, nic z toho nebylo spuštěno
v reálném prohlížeči ani na iPhonu):

- **Video import z prohlížeče** (`upload-web-video.ts`): znovupoužívá `uploadVideo()`,
  nahrazuje jen nativní švy (sonda `<video>` + poster z canvasu, díly přes
  `file.slice`, ETag z odpovědi). Jen `video/mp4`, limity ze serverových konstant
  (120 MB, 60 s). UNVERIFIED: skutečná sonda v prohlížeči (Safari nemusí vyvolat
  `seeked`) a **R2 CORS musí mít `ExposeHeaders: ["ETag"]`**, jinak každé webové
  video selže (chybová zpráva to říká). Díly se posílají sekvenčně bez opakování.
- **`resumeVideoUploads`**: `reconcileVideoUploadsOnce()` při startu fronty (jen nativně):
  selhané nahrávky zruší, běžící nechá. Dokončené nahrávky **nelze dokončit** (plugin
  uchovává jen `uploadKey`, ETagy a bajty, chybí `uploadId`, klíč, poster, rozměry);
  řádek `media` zůstane `uploading` a čeká na úklid na serveru.
- **Atribuce OSM** u navržených míst (`OsmAttribution`, cs + en); mapy mají
  `AttributionControl` už dříve.

Zbývá do brány Fáze 4: T8 (celá knihovna z iPhonu; vyžaduje zařízení), úklid v1
kódu a tabulek (vyžaduje souhlas), ruční kontrola výše uvedených UNVERIFIED bodů.

## Přepnutí v1 → v2 — postup (připraveno 2026-10-12, NESPUŠTĚNO)

Stav produkce (jen čtení, 2026-10-12): v1 má 1 cestu, 5 záznamů, 56 fotek, 252
variant, 435 MB. Migrace `…120000` až `…120300` (v2 schéma, funkce převodu) jsou
nasazené; **převod nebyl spuštěn** (`media`, `moments`, `segments` mají 0 řádků).
Migrace `20261010120000` a `…120100` (stav `rejected`, editační RPC) čekají na merge
PR #9 (CI je nasadí; jsou aditivní).

Pořadí, každý krok má kontrolu a bez ní se nepokračuje:

1. **Merge PR #9** → CI nasadí 2 migrace. Kontrola: `list_migrations` je obsahuje,
   `pnpm db:test` v CI zelené.
2. **Brána `media-upload` v produkci** (G: UNVERIFIED): zavolat funkci skutečným
   přihlášeným uživatelem (`sign-put` malého objektu, `delete-media`). Pokud gateway
   odmítne uživatelský JWT, nahrávání ve v2 nefunguje; opravit před krokem 4.
3. **Kopie souborů Storage → R2** se stejnými klíči: `scripts/copy-storage-to-r2.mjs`
   nejdřív bez `--apply` (suchý běh: počet, `wouldCopy`), potom s `--apply`.
   Potřebuje `SUPABASE_SERVICE_ROLE_KEY` v lokálním env souboru mimo git (zatím
   není k dispozici). Skript nic nemaže a je idempotentní. Kontrola: `failed = 0`,
   `skippedExisting + copied = 252`, náhodných 5 URL na `media.cestovni-denik.cz` → 200.
4. **Převod dat**: `select public.v2_migrate_from_v1();` pak
   `select * from public.v2_verify_migration();` — všechny řádky `ok`. Funkce je
   idempotentní, v1 tabulky nemění. Zkoušeno na kopii produkce (Brána Fáze 1, 9/9).
5. **Ruční kontrola ve v2 UI**: cesta v `/j/<id>/workspace`, počty médií proti
   výstupu `v2_verify_migration`, datové problémy z Brány Fáze 1 (Calgary se
   špatnou délkou, duplicity, překryvy momentů).
6. **Přepnutí vstupů**: dashboard a odkazy na cestu vedou na v2 (dnes vedou na v1).
7. **Smazání v1 kódu** (až po 5 a 6) a v1 tabulek za 30 dní jen pro čtení.

Návrat: kroky 3 a 4 jsou aditivní (R2 kopie, v2 tabulky). Vrácení = smazat řádky v2
tabulek a objekty v R2; v1 data a v1 UI zůstávají nedotčené do kroku 7.

Co vyžaduje souhlas uživatele: merge do `main` (nasazení do produkce), service role
klíč pro krok 3, spuštění kroku 4 (zápis do produkce), krok 7 (mazání).

### Přepnutí v1 → v2 — provedeno v produkci (2026-10-13)

- PR #9 mergnut, migrace `…120000` a `…120100` nasazeny CI (ověřeno `list_migrations`).
- **Kopie Storage → R2** (`copy-storage-to-r2.mjs --apply`): 245 z 252 objektů zkopírováno
  a ověřeno velikostí; 0 chyb jiných než níže. Kontrola přes veřejnou doménu: dvě
  zkoušené fotky 200 se shodnou `content-length`.
- **7 objektů nelze zkopírovat:** jde o fotky s jedinou variantou `preview`, jejíž soubor
  je ve v1 Storage **0 bajtů** (poškozené nahrávky; žádná není v záznamu, patří do
  inboxu). Zdroj nelze obnovit.
- **Převod** `v2_migrate_from_v1()`: 56 médií, 203 variant, 5 momentů, 5 míst, 3 zastávky
  přeskočeny, 11 možných duplicit. `v2_verify_migration()`: **9/9 ok** (shoda se
  zkouškou na kopii).
- Následek: těch 7 médií je ve v2 `ready` s variantou `large`, ale soubor v R2 neexistuje
  (404). Rozhodnuto uživatelem: smazat. 7 řádků `media` ve v2 smazáno (jen v2 kopie, v1 `photos`
  zůstávají), ověřeno, že žádný nebyl v momentu.
- Kontrola dat v produkci pod přihlášeným vlastníkem (RLS, jen čtení): cesta Kanada 2026,
  5 momentů, 49 médií (všechna `ready`, všechna v momentech, 0 bez cesty), 0 etap (zatím
  se nepouštělo „Uspořádat automaticky“). Zastávka Calgary má správnou délku (−114,06).
  Momenty z v1 se stále překrývají a jsou zamčené (viz Brána Fáze 1).
- Přepnutí vstupů: `/j/$journeyId` přesměruje na pracovní plochu, dashboard vede na rychlý
  zápis místo v1 „přidat moment“, z menu zmizela v1 „Rychlá poznámka“. v1 stránky a
  kód zůstávají v repu (nedostupné ze vstupů) do smazání.
- Brána `media-upload` v produkci (2026-10-13, přihlášený vlastník): bez tokenu 401,
  `sign-put` 200 s klíčem pod ID uživatele, PUT do R2 200, `delete-media` smazal 1 objekt,
  opakované smazání 0. Uživatelský JWT gateway přijímá (dřívější UNVERIFIED odpadá).
- Zbývá: smazání v1 kódu a tabulek (po schválení výsledku).

## Fáze 5 — hosté: srdíčka a komentáře (2026-10-14, rozpracováno)

- UI: srdíčko + komentáře na stránkách Cesta, Etapa/Výlet, Moment, srdíčko na fotce v
  prohlížeči. Data jdou z jednoho `get_public_engagement`, dotaz se spouští až po
  `requestIdleCallback` (první vykreslení a počet požadavků se nemění). Hostovská
  anonymní relace (`ensureGuestSession`) vzniká až při první akci (srdíčko/komentář).
- Moderace: panel „Komentáře ke schválení“ v pracovní ploše cesty (`list_pending_comments`,
  `moderate_comment`), viditelný jen když něco čeká.
- Turnstile: `VITE_TURNSTILE_SITE_KEY` (veřejný site key). Skript se načte při první akci;
  bez klíče (lokálně) se token neposílá.
- **AKCE UŽIVATELE (produkce):**
  1. Supabase Dashboard → Authentication → Sign In / Providers: zapnout **Allow anonymous
     sign-ins**.
  2. Supabase Dashboard → Authentication → Attack Protection: zapnout CAPTCHA, provider
     **Cloudflare Turnstile**, vložit **secret key** tam (do repa nikdy).
  3. Vytvořit Turnstile widget v Cloudflare (domény webu), **site key** dát do
     `VITE_TURNSTILE_SITE_KEY` pro produkční build.
  4. Lokálně: `supabase/config.toml` má `enable_anonymous_sign_ins = true` (captcha
     zůstává zakomentovaná); běžící lokální stack je potřeba restartovat (`supabase stop`
     a `start`), jinak anonymní přihlášení vrací `anonymous_provider_disabled`.
- Ověřeno proti lokální DB (JWT s `is_anonymous` podepsaný lokálním klíčem, bez GoTrue):
  vložení srdíčka a komentáře (5 sloupců) 201, komentář se `status` 403 (42501), vlastní
  pending a srdíčka čitelné, `get_public_engagement` vrací počet srdíček. NEOVĚŘENO:
  skutečné `signInAnonymously` a Turnstile (lokální stack má anonymní přihlášení vypnuté).
