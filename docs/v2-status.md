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

**Aktualizace 2026-10-17 (IMPLEMENTED, `pnpm check` zelené, větev `feat/smart-stages`, necommitováno):**
nové `stages.ts` (`planStages`) a dělení momentů podle zastávky nahrazují `suggestStageBoundaries`,
`suggestTrips` a pravidlo 90 min / 1,5 km v `planOrganization` (`trips.ts` zůstává exportovaný, ale
nepoužitý). Algoritmus byl nejdřív ladil prototypem na 1 657 reálných fotkách z Kanady (79 dní): 14 etap
místo 27 předělů, 249 momentů místo 295. Stejný výsledek dává TS port (ověřeno skriptem mimo repozitář).
**UNVERIFIED:** brána T8 (≥ 90 % médií ve správném výletu) — chybí ručně označené „správné“ rozdělení;
reálná data nejsou v repozitáři, testy jsou syntetické. Stávající navržené segmenty se stejným
časovým rozsahem si ponechají starý název a druh (klíč idempotence nezahrnuje druh).

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
- Zbývá: smazání tabulek (kód viz níže) (po schválení výsledku).

### v1 kód odstraněn (2026-10-15)

- Odstraněno (jen frontend, `supabase/` a workflow beze změn): v1 trasy `/entries/new`,
  `/e/$entryId`, `/j/$journeyId/memory/new`, `/$spaceHandle/tipy/$entrySlug`,
  `/$spaceHandle/$journeySlug/$entrySlug` (padají na not-found); stránky `entry/*`,
  `reader/*`, `JourneyPage`, vytvoření vzpomínky; v1 čtečka a přehled cesty
  (`features/journeys` kromě formuláře cesty a členů), `features/entries`,
  `features/photos`, `features/nature` (kromě šablon), `features/checklist`,
  `features/engagement`, sdílení momentu; repozitáře `entities/entry` (mutace, veřejné),
  `entities/translation`, `entities/engagement`, galerie a mutace fotek, iNaturalist/GBIF
  klienti; příslušné testy a nepoužité klíče v `packages/i18n` (cs i en, parita zachována).
- Veřejná stránka prostoru a dashboard už neukazují v1 záznamy (jen cesty).
- Záměrně ponecháno: Dexie schéma (`local-db.ts`) a synchronizační fronta
  (`shared/sync`, `SyncManager`) včetně `entities/entry|photo|checklist|nature` lokálních
  repozitářů, protože fronta může mít u uživatelů nesesynchronizované v1 operace a
  vytvoření cesty (`/journeys/new`) ji i šablony checklistu stále používá; `photo.worker.ts` a
  `process-photo` (v2 nahrávání); klíče `terms.*` (slovník s testem) a `sync.*`.
- NÁVRH (PROPOSED, 30 dní po přepnutí, vyžaduje souhlas): smazat v1 tabulky
  (`entries`, `photos`, `entry_photos`, …) a v1 edge funkce `og-share`, `translate-entry`,
  `maintain-photo-*`; odstranit `scripts/copy-storage-to-r2.mjs` a backfill skripty
  fotek, řádky nasazení těchto funkcí z workflow; poté vyřadit sync frontu a v1 tabulky z
  Dexie (verze s `stores({ ...: null })` a test migrace) a `packages/core` v1 modely.

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
- Ověřeno 2026-10-14 na restartovaném lokálním stacku: skutečné anonymní přihlášení
  (`/auth/v1/signup` bez těla → `is_anonymous`), srdíčko, `my_hearts`, smazání, komentář
  (pending neviditelný pro anon, viditelný autorovi i moderátorovi). Turnstile nezkoušen.
- Dřívější ověření (JWT s `is_anonymous` podepsaný lokálním klíčem, bez GoTrue):
  vložení srdíčka a komentáře (5 sloupců) 201, komentář se `status` 403 (42501), vlastní
  pending a srdíčka čitelné, `get_public_engagement` vrací počet srdíček. NEOVĚŘENO:
  skutečné `signInAnonymously` a Turnstile (lokální stack má anonymní přihlášení vypnuté).
- Prerender a čerstvost: předrenderované HTML (title, OG tagy, vložený strom) se přestaví
  jen při deployi, takže zrušení publikace se ve statickém HTML a OG náhledech projeví až
  při dalším deployi. V prohlížeči se vložená data po prvním vykreslení jednou
  zrevalidují (`requestIdleCallback`), zrušená cesta se pak ukáže jako nenalezená.
  NÁVRH (neimplementováno): noční nebo ručně spouštěný (workflow_dispatch) rebuild a deploy.

### Fáze 5 — shrnutí (2026-10-14, větev `v2/phase-5`, IMPLEMENTED)

- Veřejná čtečka v2 z jednoho RPC `get_public_journey`: Cesta, Etapa/Výlet, Moment
  (`/$spaceHandle/$journeySlug`, `/e/$segmentId`, `/m/$momentId`), mapa se shluky a
  trasami, srcset z variant. Tagy (průřezy) v RPC nejsou, zatím jen seznam míst.
- Předgenerování při buildu (`scripts/prerender-public.mjs`, RPC `list_public_journey_paths`):
  HTML + OG + vložený strom + sitemap/robots; v `pages.yml` je `PRERENDER_REQUIRED=1`.
- Hosté: DB kontrakt (migrace `20261014120000`–`130000`, pgTAP 495 testů celkem zelených),
  nezávislé review provedeno, nálezy opraveny (moderační bypass, oracle v
  `can_moderate_target`, sloupcová práva hearts, `$` v prerenderu, visící captcha).
- NEOVĚŘENO: reálný prohlížeč (MapLibre, CLS/LCP, Lighthouse ≥ 90, počet požadavků),
  Turnstile, prerender proti produkčnímu RPC, GitHub Pages deep linky. Lokálně není
  seed veřejné cesty. Brána výkonu Fáze 5 tedy zatím NENÍ splněna.
- Po merge: migrace nasadí CI; před zapnutím hostů udělat AKCE UŽIVATELE výše.

### Fáze 5 — výkon veřejné stránky cesty (2026-10-15, větev `perf/public-journey-lighthouse`, IMPLEMENTED, produkce NEOVĚŘENO)

- Příčina LCP 4,6 s: aplikace (~35 modulepreloadů, 54 skriptů) soupeřila o pásmo s
  hero obrázkem; samotný obrázek z cizího originu (DNS+TCP+TLS) dává i bez JS LCP ~2,7 s.
- Změny: (1) jeden chunk `app` pro vše statické ze vstupu (`vite.config.ts`
  `codeSplitting`), (2) na předgenerované stránce cesty se skripty aplikace načtou až po
  `load` hero obrázku (`bootScript`, pojistka 4 s), bez modulepreloadu, (3) CSS inline do
  HTML, (4) vložený JSON na konec `<body>`, (5) varianta `small` hera se při buildu
  zkopíruje do `dist/hero/` (stejný origin, bez nového spojení; při chybě zůstane
  vzdálená URL), `releasePrerenderShellWhenReady` čeká na obrázek v Reactu (bez bliknutí).
- Měření lokálně (Lighthouse 12 mobile, předgenerovaný build, gzip server, data z
  produkčního RPC přes mock): před perf 72–77, FCP 2,6 s, LCP 4,6–5,9 s, ~88 požadavků;
  po perf 87–98 (většinou 98), FCP 1,3 s, LCP 2,3 s, TBT ≤ 40 ms, CLS 0, ~50 požadavků
  (z toho mapa a dlaždice po načtení). Produkce se musí změřit po nasazení.
- Návrh (bez změny): doména míří přímo na GitHub Pages (Fastly, `max-age=600`),
  Cloudflare HTML necachuje. Další zrychlení: menší variant hera (~480 w) v pipeline médií.

### Fáze 5 — výkon veřejné stránky cesty, kolo 3 (2026-10-15, větev `perf/lighthouse-round3`, IMPLEMENTED, produkce NEOVĚŘENO)

- Příčina Speed Indexu ~7,4 s: pod datem byla prázdná plocha až do mapy (MapLibre + dlaždice).
  Lantern SI = 1,4 × pozorovaný SI + 0,4 × vážený čas pozdních layoutů; pozorovaný SI je histogram snímků.
- Změny (každá změřena): (1) statický shell obsahuje nadpis „Trasa" (cs/en, volba inline skriptem),
  placeholder mapy (barevná distribuce Mapy outdoor, trasa a piny z dat přes `buildMapPreview` v
  `packages/core`) a atribuci; React kreslí totéž a mapu prolne (CLS 0, bez bliknutí). (2) Strom
  cesty je v `<cesta>/data.json` místo inline JSON: HTML 19,9 → 11,5 KB gz (pod úvodní TCP okno ~14,6 KB).
  (3) Boot skript po načtení hera preloaduje chunky veřejné trasy a mapy z `dist/.vite/manifest.json`
  (`build.manifest`). (4) React hero používá stejnou same-origin kopii (`heroMirror`), bez
  dvojího stahování. (5) Mapy tiles přímo (`tiles` místo `tiles.json`, o jeden round trip méně),
  preconnect na api.mapy.com. (6) Odstraněno ~20 KB mrtvého CSS z v1 (`src/index.css`);
  inline CSS má `<link disabled>`, aby lazy chunky nestahovaly CSS znovu.
- Měřeno LOKÁLNĚ, kalibrovaný harness (HTTPS/H2, gzip, 900 ms odezva všech požadavků, Lighthouse 12
  mobile, medián 3–5 běhů po rozběhu): před perf 89 (89–90), FCP 1,83, LCP 2,26, SI 8,4, TBT 43;
  po perf 94 (94–94), FCP 1,69, LCP 2,11, SI 5,1, TBT 70, CLS 0, a11y/SEO/BP 100.
  Harness vychází o ~2 body lépe než produkce (86–88) a LCP o ~0,5 s níže; produkce NEOVĚŘENA.
- Nezkoušeno/vynecháno: re-enkódování hera (ImageMagick lokálně není), kritické CSS, start
  aplikace souběžně s herem (v simulaci bez výhody pro LCP, reálně riziko), odložení session runtime.

### Test na iPhonu 13 mini (2026-10-16)

- Přihlášení v nativní aplikaci prošlo s Turnstile (build s veřejným site key; widget má povolený `localhost`).
- Import přes PhotoKit: původní výběr jen podle data byl nepraktický, přidán nativní výběr z knihovny
  (`PHPickerViewController`, Oblíbené/alba, `pickAssets` v `MediaLibraryPlugin`). VERIFIED na zařízení:
  vybráno 6 položek (5 fotek, 1 video), 6 prošlo, čas a poloha sedí (kontrola uživatelem).
- NEOVĚŘENO: opakovaný import bez zdvojení, násilné ukončení při nahrávání videa, omezený přístup ke knihovně,
  iCloud-only originály ve výběru, rychlý zápis s polohou, T8 (automatické rozdělení celé Kanady).
- Zpětná vazba: vzhled správy etap/momentů/cesty (pracovní plocha) je graficky slabý; řešit zvlášť.

### Oprava: seznamy bez stránkování (2026-10-18, větev `feat/smart-stages`, IMPLEMENTED)

- Příčina: `listJourneyMedia`, `listJourneyMoments` a `listJourneySegments*` četly jediným dotazem a PostgREST
  vrací max. `max_rows` = 1000 řádků. Cesta Kanada měla 2540 médií, z toho 1542 bez momentu; „Uspořádat
  automaticky“ i mapa viděly jen prvních 1000 podle času, druhé spuštění vyšlo prázdné.
- Oprava: `fetchAllPages` (`src/shared/api/fetch-all-pages.ts`) čte po stránkách se stabilním řazením (+ `id`).
  Test stránkování přidán. Produkční data NEPŘEUSPOŘÁDÁNA: je potřeba znovu spustit „Uspořádat automaticky“.

## Fáze 4b — pracovní plocha jako třídírna (2026-10-18, P1 hotovo lokálně)

Větev `feat/workspace-curation`, necommitnuto. Plán: `plan-v2.md`, Fáze 4b a rozhodnutí 8.

| Část                                                                                                                                                                                                     | Stav                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrace `20261018120000_v2_workspace_curation.sql`: `media.deleted_at`, `purge_claimed_at`, RPC `trash/restore/claim_media_purge/purge_media`, `move_media`, `create_moment_from_media`, `delete_moment` | ✅ pgTAP 543/543 lokálně. Veřejné RPC skrývají smazané fotky i jejich obálky. Trvalé smazání smí jen nahrávající a jen po zamčení. `keep_media` nikdy nepřesune fotky do momentu s jinou viditelností. Na produkci aplikováno 2026-10-19 (PR #22). |
| Prohlížeč fotek (`MediaViewer`)                                                                                                                                                                          | ✅ lokálně v prohlížeči (otevření, pozice, panel, Del → koš). Skutečné fotky z R2, video a iOS UNVERIFIED                                                                                                                                          |
| Osnova Etapa → Den → Moment, filtr, nadpisy dnů                                                                                                                                                          | ✅ lokálně v prohlížeči (skok na den přistane na 96 px pod hlavičkou)                                                                                                                                                                              |
| Doplňování míst (`resolve-place` na pozadí, jen pro editory). 2026-10-19: Nominatim vracel z edge funkce 403 (blokace cloudových adres), přepnuto na Mapy.com (`MAPY_API_KEY` v secrets)                 | 🟡 testy. Proti skutečnému `resolve-place` UNVERIFIED (lokálně funkce neběžela)                                                                                                                                                                    |
| Mapa: přiblížení na cestu/etapu/den, barvy etap, trasa, pin ↔ moment, bez přestavby při úpravách                                                                                                         | ✅ lokálně v prohlížeči (OSM podklad)                                                                                                                                                                                                              |
| Líné vykreslování momentů                                                                                                                                                                                | ✅ jsdom: 601 → 41 `<img>`; lokálně se momenty kolem cíle vykreslí hned. Kanada v produkci (~1 300 fotek) neměřeno                                                                                                                                 |
| Koš: smazání fotky s Undo (vrací i obálky), smazání momentu ve dvou režimech, stránka Koš (obnovit, smazat natrvalo, vysypat)                                                                            | ✅ lokálně: smazání, Undo, obnovení. Trvalé smazání proti R2 UNVERIFIED. Automatické vysypání po 30 dnech **není** (jen odpočet v UI)                                                                                                              |

Kontroly: `pnpm check` ✅ (145 souborů, 697 testů + 2 očekávané fail), `pnpm db:test` ✅ 543. Nezávislá revize: 3 vážné nálezy opraveny (souběh trvalého smazání a obnovení, únik nezveřejněných fotek přes `delete_moment`/`move_media`, doplňování míst u čtenářů).

Zbývá: P2 (výběr a hromadné akce, přesun fotek v UI, operace s etapami, „Přijmout vše“), P3, automatické vysypání koše (cron nebo edge funkce), nasazení migrace na produkci.

## Fáze 4d — mobilní editace a třídění dávky (2026-10-22, 📝 PROPOSED)

| Krok                                   | Stav         | Poznámka                                                                      |
| -------------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| Analýza stavu editace (web, iOS)       | ✅ hotovo    | Jedna aplikace pro obě platformy; na iPhonu kroky 3–6 Fáze 4c dosud neověřeny |
| Rozhodnutí (třídění po nahrávání, A)   | ✅ potvrzeno | `media.reviewed_at`; stovky médií na dávku; foťák a sdílení mimo fázi         |
| M0 ověření na iPhonu + mobilní mockup  | ⏳ čeká      | Mockup schvaluje uživatel před kódem                                          |
| DB: `media.reviewed_at`                | ⏳ čeká      | Migrace + pgTAP + typy (`db-specialist`)                                      |
| M1 dávka k roztřídění (`/j/:id/batch`) | 🧪 TESTED    | Jednotkové a komponentní testy; neověřeno na zařízení ani v prohlížeči        |
| M2–M4                                  | 📝 PROPOSED  | Viz plan-v2.md, Fáze 4d                                                       |

Na jindy: tmavý režim aplikace (Fáze 4d, mimo rozsah).

## Fáze 5b — Atlas čtenáře (2026-10-23, 🚧 rozpracováno)

Plán: `plan-v2.md`, Fáze 5b; návrh `docs/design/atlas-ctenare.html`. Každý krok je samostatný PR.

| Krok                | Stav      | Poznámka                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Data (`dayNotes`) | 🧪 TESTED | Zod schéma (výchozí `[]` pro starší prerender), fixture (syntetická), `JourneyModel.dayNoteByDate/dayKeyOf/daysOfStage`, test hranice dne. `pnpm check` ✅. Bez DB změny. Produkční RPC neověřeno                                                                                                                                                                                                                                                                                                                                                                                   |
| 2 Základ            | 🧪 TESTED | `StatRow`, `StageStrip`, `StageBadge`, `DayMosaic`, `StopRow`, `Crumbs` (přesunut do `features/public-journey/ui`), sdílený `shared/ui/MosaicGrid` (používá i `DayCard`), jedna paleta `shared/lib/stage-palette.ts` (editor i čtenář), `publicMomentTitle` (nikdy holé „Moment“). `pnpm check` ✅. Komponenty zatím nejsou na stránkách (krok 3–5), screenshoty proto N/A                                                                                                                                                                                                          |
| 3 Stránka cesty     | 🧪 TESTED | Nová hlavička (celostránková titulka, čísla, Začít číst/Sdílet), lepicí navigace, pás etap, mapa + legenda, karty etap (první velká), místa; skeleton i statický shell prerenderu přepsány (stejné rozměry; společné `buildJourneyStats`, `formatJourneyPeriod` v core). `pnpm check` ✅ (prerender v checku přeskočen bez Supabase). Playwright rig s mockem backendu: `pnpm test:e2e:public` (`playwright.public.config.ts`, syntetická cesta v `tests/e2e-public`). Screenshoty 1400/390 prohlédnuty, bez horizontálního přetečení. Lighthouse a reálný prerender UNVERIFIED     |
| 4 Etapa a výlet     | 🧪 TESTED | Den jako sekce (nadpis + Den N, místa, mozaika max. 3 fotky + „+N“ s lightboxem, zápis dne `dayNotes` s iniciálou, karta výletu/treku, řádky zastávek), rail dnů (≥ 1000 px, lepicí) / čipy (mobil), lepicí mapa etapy / mini mapa, předchozí/další etapa, líné dny (`content-visibility: auto`), titulek etapy se pásem etap. `MediaLightbox` vyčleněn z `MediaGallery`. Screenshoty 1400/390 prohlédnuty (syntetická data), bez přetečení. Doba výletu v kartě chybí (data ji nemají). Lighthouse a 300+ fotek v jednom dni UNVERIFIED                                            |
| 5 Moment a lightbox | 🧪 TESTED | Nový detail: fotka v sloupci textu (poměr 4:3–16:9, popisek), štítek „Etapa · Den · Zastávka N z M“, serifový text, pás dalších fotek, předchozí/další, plovoucí lišta „↑ Etapa · 4/11 · Další →“. Lightbox: počitadlo s `aria-live`, popisek, srdíčko, šipky, Esc, swipe (pointer events), návrat fokusu, preload sousedních fotek, fotka vcelku (`object-contain`, panorama jen tady); pinch jen nativně (`touch-action: pan-y pinch-zoom`), neověřeno na zařízení. Playwright E2E cesta → etapa → zastávka → lightbox → zpět + swipe, desktop i 390 px ✅. Lighthouse UNVERIFIED |
| 6 Mapa              | 🧪 TESTED | Legenda ↔ trasa ↔ pás etap (hover/fokus zvýrazní etapu, ostatní trasy a piny se ztlumí; najetí na pin nebo čáru zvýrazní legendu), na stránce etapy najetí na den ↔ jeho piny, shluky v barvě etapy (jen jednoetapové). Playwright: hover legendy a 399 pinů (≤ 80 DOM markerů, shluky barevné), desktop i 390 px ✅. Reálná Kanada (~1 300 fotek) a dotyková zařízení UNVERIFIED                                                                                                                                                                                                   |
| 7 Detaily           | ⏳ čeká   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Poznámka ke kroku 1: RPC páruje zápis dne s momenty podle `journeys.home_tz` (jinak UTC), model hledá zápis podle dne v pásmu etapy. Pokud se pásmo etapy liší od domácího a moment leží blízko půlnoci, zápis se může zobrazit u sousedního dne. Neověřeno na reálných datech.
