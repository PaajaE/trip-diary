# Trip Diary v2 — implementační plán

**Stav:** schváleno, rozhodnutí v kap. 9 · **Datum:** 2026-10-09

Tento dokument nahrazuje dosavadní plány (`expo-mobile-implementation-plan.md`,
`stage-4-roadmap.md`, `journey-*`, `memory-first-ux-plan.md` …). Po schválení se
staré plány přesunou do `docs/archive/`.

---

## 1. Cíl a principy

**Produkt:** platforma pro uchování a sdílení cestovních zážitků. Základ tvoří mapa,
fotky a videa a k nim doplněné texty.

Principy, podle kterých se rozhoduje každý krok:

1. **Automaticky, kde to jde.** Čas, poloha a zařazení do cesty, etapy, výletu a
   momentu se odvozují z metadat médií. Člověk jen potvrzuje, pojmenovává a píše.
2. **Ruční zásah má vždy přednost** a automatika ho nikdy nepřepíše.
3. **Jeden kód pro web i mobil.** React aplikace běží na webu i v Capacitoru (iOS).
   Nativní kód je jen v tenkých Swift pluginech pro věci, které WebView neumí:
   knihovnu fotek, převod videa a upload na pozadí. Android teď není potřeba.
4. **Médium je hlavní stavební prvek.** Fotka nebo video existuje v cestě samo za
   sebe. Momenty, výlety a etapy jsou nad ním, ne naopak.
5. **Čas je okamžik plus časové pásmo.** Každý čas se ukládá jako přesný okamžik
   (UTC) a k němu časové pásmo místa, kde vznikl.
6. **Žádné hotfixy staré verze.** v1 se jen udržuje v chodu, dokud ji v2 nenahradí.
7. **Provoz zdarma.** Bez placených služeb, dokud to provoz nevyžaduje (kap. 3.1).

---

## 2. Výchozí stav (zjištěno při analýze)

| Oblast          | Zjištění                                                                                                                                                                                                 | Důsledek pro plán                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Klienti         | Web/PWA, Capacitor (iOS/Android) a Expo (`apps/mobile`, ~24k řádků)                                                                                                                                      | Expo se zmrazí a odstraní z `main`                                             |
| GPS             | Capacitor plugin čte GPS z kopie souboru (`PhotoMetadataPlugin.swift`)                                                                                                                                   | Funguje jen částečně. v2 bere metadata z knihovny fotek (PhotoKit, MediaStore) |
| Čas média       | `DateTimeOriginal` se čte bez časového pásma                                                                                                                                                             | Špatné řazení napříč pásmy (Alberta, BC, Yukon, Aljaška)                       |
| Čas momentu     | `eventAt = new Date()` při vytvoření                                                                                                                                                                     | Datum zápisu místo data zážitku                                                |
| Video           | Bez převodu formátu (HEVC/MOV se nahraje jako `video/mp4`), celé video jde přes JS a IndexedDB, upload jedním požadavkem, nesourodé limity (80 MB aplikace, 100 MB bucket, 15 MiB lokální `config.toml`) | Nová nativní video pipeline                                                    |
| Model           | Cesta → „denní štítek“ (etapa) → Místo (plánované/navštívené) → Záznam s ručně přiřazenými fotkami. Tagy fotek jsou vázané na jednu cestu.                                                               | Nový model (kap. 4)                                                            |
| Prezentace      | SPA, 147 požadavků při načtení cesty, postupné skládání stránky 5–8 s, problémy s mapou                                                                                                                  | Přepsat až v Fázi 5 nad novým modelem                                          |
| Data v produkci | 1 cesta, 5 momentů, 49 fotek (veřejný profil `ecerovi2016`)                                                                                                                                              | Migrace je malá, ale musí být bezztrátová                                      |

---

## 3. Architektura v2

```
┌─────────────────────────── jedna React aplikace ───────────────────────────┐
│  Psaní (owner)        │  Prezentace (veřejná)     │  Sdílené: model, mapa,   │
│  časová osa, import,  │  cesta, etapa, výlet,     │  automatika, i18n         │
│  editor, tagy         │  moment, tip, profil       │                          │
└───────────┬───────────┴─────────────┬─────────────┴──────────────────────────┘
            │                         │
   MediaSource (rozhraní)             │ Veřejné stránky: předgenerované / SSR
   ├─ web: <input>, exifr             │ (rozhodnutí ve Fázi 5)
   └─ iOS: plugin MediaLibrary (Swift)
            │
   UploadQueue (rozhraní)
   ├─ web: multipart upload z prohlížeče (fotky z PC, krátká H.264 videa)
   └─ iOS: převod + multipart upload na pozadí (background URLSession)
            │                                   ▲ podepsané URL (edge funkce)
            ▼                                   │
   Cloudflare R2 (soubory médií) ◄──────────────┘
   Lokální databáze (Dexie) + outbox jen pro metadata ──► Supabase (Postgres + RLS + Auth)
```

Klíčová rozhodnutí:

- **Velké soubory nikdy nejdou přes JS.** Nativní vrstva drží soubor na disku,
  převádí ho, nahrává ho a do JS posílá jen stav a metadata.
- **Automatika je čistý TypeScript** v `packages/core`: deterministické funkce bez
  vedlejších efektů, testované na reálném datasetu z Kanady. Běží na klientovi,
  takže funguje i offline.
- **Synchronizace se zjednoduší.** Outbox nese jen záznamy (médium, úsek, moment, text),
  upload souborů má vlastní frontu. Dnešních 26 typů operací se nahradí několika
  obecnými upserty a mazáními po entitách.

### 3.1 Provoz zdarma

| Služba                          | Na co                                                   | Free limit (ověřit ve Fázi 0)                                         | Poznámka                                                                                                        |
| ------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Supabase Free                   | Postgres, Auth (vč. anonymních přihlášení), edge funkce | 500 MB DB, 5 GB přenosu/měs.                                          | Na metadata bohatě stačí. Projekt se po 7 dnech bez aktivity uspí, proto pravidelný ping (GitHub Actions cron). |
| **Cloudflare R2**               | soubory fotek a videí                                   | 10 GB úložiště, **přenos zdarma**, 1 mil. zápisů a 10 mil. čtení/měs. | Klíčové: Supabase Storage má na Free jen 1 GB a obrázky by vyčerpaly přenos. Nad limit ~0,015 USD/GB/měs.       |
| Cloudflare Pages / GitHub Pages | web                                                     | statický hosting zdarma                                               | Cloudflare Pages + Workers umožní i SSR veřejných stránek zdarma (rozhodnutí ve Fázi 5)                         |
| Cloudflare Turnstile            | ochrana komentářů bez registrace                        | zdarma                                                                |                                                                                                                 |

**Odhad kapacity 10 GB:**

- originály se neukládají, ty zůstávají v knihovně fotek nebo v iCloudu;
- fotka ≈ 0,6 MB všech variant dohromady;
- video do 1 min, 1080p ≈ 30 MB.

Vejde se tedy zhruba **5 000 fotek a 150 videí**, což by na Kanadu mělo stačit.
Kapacita se hlídá od Fáze 2 (stav úložiště v nastavení).

---

## 4. Doménový model v2

### 4.1 Hierarchie

| Úroveň                     | UI (cs)                                     | Měřítko          | Vzniká                                         |
| -------------------------- | ------------------------------------------- | ---------------- | ---------------------------------------------- |
| `journey`                  | **Cesta**                                   | měsíce           | ručně                                          |
| `segment` (kind = `stage`) | **Etapa**                                   | týdny až měsíce  | ručně na časové ose, aplikace navrhuje předěly |
| `segment` (kind = `trip`)  | **Výlet** (typ: trek, výlet, přesun, pobyt) | hodiny až dny    | aplikace navrhne, člověk potvrdí               |
| `moment`                   | **Moment**                                  | minuty až hodiny | automaticky (shluk médií)                      |
| `media`                    | **Fotka / video**                           | okamžik          | import                                         |

**Členství se určuje časem.** Etapa a výlet jsou časové úseky. Médium patří do toho
nejužšího úseku, do jehož rozsahu spadá jeho čas. Ruční přeřazení se uloží jako
výjimka (`media.segment_override_id`).

### 4.2 Tabulky (návrh)

```
journeys       id, owner_id, title, slug, summary, status(planning|active|done),
               visibility, cover_media_id, home_tz
segments       id, journey_id, parent_id?, kind(stage|trip), trip_type?(trek|day|transfer|stay),
               title, body, starts_at, ends_at, tz, cover_media_id, track_id?, position,
               origin(manual|suggested|accepted)
moments        id, journey_id, starts_at, ends_at, centroid(lat,lng), place_id?, title?, body?,
               origin(auto|manual), locked(bool)        -- locked = automatika nesahá
media          id, owner_id, journey_id?, kind(photo|video), captured_at (timestamptz),
               captured_tz (IANA), lat?, lng?, altitude?, width, height, duration_ms?,
               source_asset_id?, content_hash, starred, caption, focal_x/y,
               moment_id?, segment_override_id?, status(pending|uploading|ready|failed)
media_variants media_id, kind(thumb|small|medium|large|video|poster), path, mime, w, h, bytes
places         id, name, country, region, lat, lng, geocode_source   -- globální, sdílené
tracks         id, segment_id, geojson (LineString), source(gpx|derived), distance_m, ascent_m
posts          id, owner_id, kind(tip|article), title, body, slug, visibility,
               journey_id?, segment_id?, place_id?           -- tipy mimo cestu
tags           id, kind(category|free|species), slug, label, parent_id?, gbif_taxon_id?
taggings       tag_id, target_type(media|moment|post), target_id
reactions      id, target_type(journey|segment|moment|media|post), target_id, actor_id  -- srdíčka
comments       id, target_type, target_id, actor_id, display_name, body,
               status(pending|approved|hidden), created_at
members, invites, profiles      -- převzít z v1, beze změny logiky
```

Pravidla:

- `captured_at` je vždy přesný okamžik. `captured_tz` je pásmo, ve kterém médium vzniklo
  (z EXIF `OffsetTimeOriginal`, jinak odvozené z GPS, jinak `journeys.home_tz`).
- `content_hash` a `source_asset_id` zajišťují, že opakovaný import nevytvoří duplikáty.
- Texty se píšou na úrovni etapy, výletu nebo momentu. Moment bez textu je v pořádku.
- Tip (`posts`) nemusí mít žádnou vazbu na cestu ani na místo.
- `media_variants.path` je klíč v R2. Originál se neukládá.
- Srdíčka a komentáře může přidat i host bez registrace přes anonymní přihlášení
  Supabase (`actor_id`). Komentáře hostů čekají na schválení autorem cesty.

### 4.3 Co se stane s v1

| v1                                                                  | v2                                           |
| ------------------------------------------------------------------- | -------------------------------------------- |
| `journey_stages`                                                    | `segments(kind=stage)`                       |
| `journey_stops` (navštívené)                                        | `places`, případně `moments`                 |
| `journey_stops` (plánované)                                         | zrušit (plánování z produktu mizí)           |
| `entries` + `entry_journey_links`                                   | `moments` (text)                             |
| `entries` mimo cestu, typ `tip`                                     | `posts`                                      |
| `journey_guide_sections`                                            | `posts(kind=tip, journey_id)`                |
| `photos`, `photo_variants`, `entry_photos`                          | `media`, `media_variants`, `media.moment_id` |
| `journey_photo_tags`, `photo_tag_assignments`                       | `tags`, `taggings`                           |
| `nature_observations`                                               | `taggings` s `tags(kind=species)`            |
| `content_hearts`, `content_comments`                                | `reactions`, `comments` (přenést)            |
| `photos` soubory v Supabase Storage                                 | zkopírovat varianty do R2, pak bucket smazat |
| `journey_checklist_items`, `entry_translations`, přírodovědný modul | zmrazit, do v2 se nepřenáší (Fáze 6)         |

---

## 5. Fáze

Každá fáze končí **vstupní bránou** (měřitelná kritéria). Dokud brána neprojde,
další fáze nezačne.

### Fáze 0 — Úklid a ověření předpokladů (spiky)

Cíl: než se cokoli staví, prokázat, že zvolená cesta technicky funguje.

**0.1 Úklid**

- Rozpracované změny (26 souborů) uložit do větve `archive/v1-video-wip` jako
  referenci. `main` vrátit na poslední commit.
- `apps/mobile` (Expo) přesunout do větve `archive/expo`, z `main` odstranit včetně CI
  jobu `mobile-quality` a závislostí ve workspace.
- Staré plány do `docs/archive/`, `README` aktualizovat.
- Přidat `CLAUDE.md` se stručnými konvencemi.

**0.2 Testovací dataset**

- Vybrat z Kanady **reprezentativní vzorek** médií: ~300 fotek a ~15 videí, včetně
  Magog treku, přejezdu časových pásem (BC→Yukon→Aljaška), fotek bez GPS,
  4K/HEVC videí a Live Photos.
- Z nich vytáhnout jen metadata (čas, pásmo, GPS) do JSON fixture
  (`packages/core/fixtures/canada.json`), bez obrázků. Na fixture se testuje
  veškerá automatika.

**0.3 Spike A — import z knihovny fotek (iOS)**

- Minimální Capacitor plugin `MediaLibrary` přes PhotoKit: oprávnění (včetně
  „omezeného přístupu“), výpis assetů podle časového rozsahu, `PHAsset.location`,
  `creationDate`, `localIdentifier`, export originálu do souboru.
- **Brána:** u 100 % testovacích fotek s polohou v aplikaci Fotky se získá GPS. Čas
  sedí na sekundu. Import 300 položek proběhne bez pádu a v únosném čase (cíl < 2 min
  na metadata).

**0.4 Spike B — video a upload do R2**

- R2 bucket a edge funkce v Supabase, která po ověření uživatele vydá podepsané URL
  pro S3 multipart upload (klíče k R2 nikdy neopustí server).
- Převod v nativním kódu (`AVAssetExportSession`, H.264/AAC, 1080p, ~4 Mbit/s)
  a nahrání po částech přes background `URLSession`.
- **Brána:**
  - 1minutové 4K HEVC video se převede (≤ ~30 MB) a nahraje i při vypnutí a zapnutí
    sítě během uploadu a při přepnutí aplikace do pozadí;
  - výsledek přehraje Safari, Chrome i Firefox na PC;
  - paměť aplikace během procesu nepřesáhne ~200 MB;
  - veřejné čtení z R2 funguje přes vlastní doménu (např. `media.cestovni-denik.cz`).

**0.5 Infrastruktura**

- Ověřit aktuální free limity (Supabase, R2, Pages, Turnstile) a zapsat je do
  kap. 3.1.
- Jedna konfigurace limitů (video ≤ 60 s, velikosti variant) v `packages/utils`,
  ze které čte klient i edge funkce.
- Ping proti uspání Supabase projektu.

**Výstup Fáze 0:** go/no-go pro Capacitor. Pokud spike A nebo B selže, rozhodne se o
alternativě dřív, než se napíše produkční kód.

### Fáze 1 — Nový model a migrace dat

- Nové migrace podle kap. 4.2: tabulky, RLS, RPC a pgTAP testy. Stávající disciplínu
  zachovat: generované typy, Zod na hranicích, CI kontrola.
- Doménové typy a schémata v `packages/core`.
- **Migrační skript v1 → v2** (SQL + ověřovací dotazy):
  - opravit časy: `media.captured_at` z EXIF, `moments.starts_at` z médií, ne z `created_at`;
  - zkopírovat soubory variant ze Supabase Storage do R2;
  - po migraci zkontrolovat, že počty a vazby sedí (5 momentů, 49 médií, všechny
    varianty existují ve storage).
- v1 a v2 tabulky žijí krátce vedle sebe. Přepnutí proběhne najednou, po Fázi 4.
- **Brána:** `db:test` zelený, migrace na kopii produkce bezztrátová (automatická
  kontrola), RLS testy pro všechny nové tabulky (owner, member, veřejnost).

### Fáze 2 — Media pipeline

- Rozhraní `MediaSource` a `UploadQueue` v TS s implementací pro web a pro iOS.
- **Import:** „vše od posledního importu“ nebo výběr rozsahu dat. Deduplikace přes
  `source_asset_id` a `content_hash`.
- **Fotky:** varianty (thumb, small, medium, large; WebP/JPEG) vznikají nativně na
  mobilu a v prohlížeči na PC. Logika variant zůstává v `packages/utils`.
- **Videa:** do 60 s, převod na H.264 1080p, poster a multipart upload do R2 na
  pozadí. Na webu (PC) se přijímá jen H.264 MP4, jinak srozumitelná hláška.
- **Úložiště:** přehled obsazení R2 vůči limitu 10 GB.
- **Časová pásma:** `captured_tz` z EXIF offsetu, jinak z GPS (offline knihovna pro
  hledání pásma podle souřadnic, např. `tz-lookup`), jinak `home_tz`.
  - Zjištěno ve spiku A: bez EXIF offsetu PhotoKit vyloží čas v pásmu zařízení
    (`PHAsset.creationDate` je pak špatně). U takových médií se okamžik přepočítá
    z `DateTimeOriginal` a pásma odvozeného z GPS. Fotky z iPhonu offset mají,
    týká se to hlavně importů z jiných fotoaparátů.
- **Oprávnění:** plný přístup ke knihovně je pro automatický import nutný. Při
  omezeném přístupu aplikace vidí jen vybrané fotky, takže UI musí upozornit
  a nabídnout rozšíření výběru (`presentLimitedLibraryPicker`).
- Fronta uploadu přežije restart aplikace a ukazuje průběh. Upload jen na Wi-Fi je
  nastavitelný.
- **Brána:**
  - import celého testovacího datasetu bez chyb a bez duplikátů při opakování;
  - 100 % médií s GPS má polohu, čas sedí napříč pásmy;
  - videa projdou bránou ze spiku B;
  - výpadek sítě uprostřed importu nic neztratí.

### Fáze 3 — Automatika

Čisté funkce v `packages/core/automation/`, každá testovaná na fixture z Kanady:

1. **Shlukování do momentů (podle zastávky, ne podle pevné mezery):** foto patří
   k momentu, pokud je do 15 min a do 3 km, nebo do 3 h a do 0,6 km od jeho středu
   (bez GPS do 30 min); momenty s < 3 fotkami se slučují se sousedem (≤ 6 h, ≤ 5 km).
   Stabilní ID z prvního média zůstává.
2. **Etapy (dělení trasy po dnech):** optimální rozdělení podle polohy dní (rozptyl
   - penalizace za předěl, levnější předěl při změně pásma, pauze spojené se
     změnou místa nebo velkém skoku). Penalizaci volí algoritmus (etapa ≈ týden).
     Izolují se „špičky“ (den daleko a zpět), pauza na stejném místě není předěl
     (pobyt bez fotek). Druhy: **pobyt** (≥ 4 noci u základny, 8 km), **oblast**
     (road trip po oblasti, ≤ 220 km), **odbočka** (> 100 km a návrat do týdne, je
     samostatná etapa, ne součást okolní), **příjezd** (město po příletu > 600 km),
     **přesun**, **zastávka**, **vzdálená zastávka**. Každá etapa má důvod.
3. **Výlety:** uvnitř pobytu den / trek / vícedenní výlet podle večerů mimo
   základnu; uvnitř oblasti „místa“ (návštěvy do 25 km).
4. **Místa:** reverzní geokódování středu momentu na serveru (edge funkce, cache v
   `places`) a sloučení blízkých míst.
5. **Trasy:** z GPX (import) nebo odvozené z médií, zjednodušené pro mapu.

Pravidla stability:

- Automatika **nikdy nemění** `locked` momenty, úseky s `origin=manual|accepted` ani
  ruční výjimky.
- Přepočet je idempotentní: stejný vstup dává stejný výstup.

**Brána:** na fixture Kanady se ručně připraví „správné“ rozdělení (etapy podle
kap. 6 a výlety jako Magog, Salmon Glacier, trajekt) a automatika ho trefí. Cíl je
≥ 90 % médií ve správném výletu a 100 % ve správné etapě po ručním nastavení předělů.

### Fáze 4 — Psaní obsahu (owner UI)

- **Mobil, na cestě:** rychlý zápis (text a fotky, poloha a čas automaticky),
  stav importu a uploadu, offline.
- **PC, doma:** **časová osa s mapou** jako hlavní pracovní plocha:
  - stříhání etap tažením předělů, potvrzení nebo zamítnutí navržených výletů;
  - slučování a dělení momentů, výběr nejlepších fotek (hvězdička), titulní fotky;
  - editor dlouhých textů pro etapu, výlet a moment;
  - tagy (kategorie, volné, druhy přes GBIF);
  - tipy (`posts`) mimo cestu.
- Názvosloví v celém UI: **Cesta → Etapa → Výlet → Moment → Fotka/Video**, **Tip**.
- **Přepnutí v1 → v2:** spustit migraci na produkci, smazat v1 kód, tabulky ponechat
  30 dní jen pro čtení a pak je odstranit.
- **Brána:** celou Kanadu (všechna média) jde naimportovat a uspořádat do etap a výletů
  do 30 minut práce. Žádná data se při tom neztratí ani nezdvojí.

#### Fáze 4b — Pracovní plocha jako třídírna (2026-10-18)

Výchozí stav (produkce, Kanada): 345 momentů, z toho 5 pojmenovaných, 48 s jedinou
fotkou; osnova bez data a místa; dialog fotky bez náhledu; nejde mazat; mapa začíná
na celém světě; ~1 300 dlaždic se vykreslí najednou. `resolve-place` existuje, UI ho
nevolá.

- **P1**
  - **Osnova po dnech:** Etapa → (Výlet) → Den → Moment. Den je jen odvozený v UI
    (místní den podle `captured_tz`). Popisek momentu: název → místo → čas.
  - **Místa:** doplnit `moments.place_id` přes `resolve-place` na pozadí.
  - **Prohlížeč fotek:** celá obrazovka, šipky přes momenty, pás náhledů, panel nástrojů
    (★, popisek, obálka, výřez obálky, přesunout, vyjmout do nového momentu, smazat,
    info). Na mobilu tah prstem.
  - **Koš:** smazání fotky je měkké (`deleted_at`), 30 dní v koši, obnovení, Undo.
    Smazaná fotka se opakovaným importem nevrátí (podle `content_hash`). Varianty
    v R2 se mažou až po vyprázdnění koše.
  - **Mapa:** přiblížení na cestu, etapu a den, barvy etap, trasa, propojení pin ↔ moment.
  - **Výkon:** virtualizovaný seznam, náhledy líně.
- **P2**
  - Výběr fotek (Shift/Cmd), lišta hromadných akcí, přesun fotek mezi momenty.
  - Momenty: přejmenovat, smazat (fotky k sousednímu momentu, nebo do koše i s fotkami),
    hromadně sloučit nebo smazat z osnovy.
  - Etapy a výlety: přejmenovat, sloučit, rozdělit, smazat; „Přijmout vše“ u návrhů.
- **P3**
  - Režim vybírání (★ / smazat / další jen klávesami).
  - Časový pás etap s tažením předělů.
  - Návrh na sloučení drobných momentů.
  - Návrhy názvů z míst.

Brána: na Kanadě jde v produkci najít libovolný den do 10 s z osnovy, smazat a obnovit
fotku a projít moment v prohlížeči bez opuštění klávesnice.

#### Fáze 4c — Atlas cesty (2026-10-21)

Koncept s klikacím prototypem: https://claude.ai/artifact/FpjvmFkyzQv3weqbL45FVY
(soukromý artefakt). Vychází z rešerše Polarsteps, Apple Fotky a Deník, Google Fotky,
Lightroom, Day One a FindPenguins.

Tři úrovně jako přiblížení mapy:

- **Cesta (přehled):**
  - etapy vlevo s pokrokem;
  - karty dnů s mozaikou a hlavní fotkou;
  - mapa s bublinami etap;
  - lišta úkolů: návrhy ke schválení, dny bez textu, dny k výběru fotek.
- **Den (panel s vlastní adresou `/workspace/den/<datum>`):**
  - mapa dne s očíslovanými zastávkami a text dne;
  - zastávky s mřížkou fotek a vlastním textem;
  - výběr a hromadné akce, šipkami předchozí a další den.
- **Fotka:** prohlížeč (hotovo) a režim Výběr nejlepších (klávesy ★ / skrýt / další).

Navíc:

- **Detail etapy:** název navržený z míst, úvodní text, posun hranic, přehled dnů.
- **Návrh uspořádání:** zobrazí se na časovém pásu celé cesty a přijme se najednou
  (místo karet po jednom).
- **Text na každé úrovni:** popisek fotky, text zastávky, **zápis dne (nové)**, text výletu
  nebo treku, text etapy a shrnutí cesty.

Fáze:

1. **Správná data:**
   - pásmo z polohy (konec „UTC“);
   - dny mimo etapy na svém místě v čase;
   - rozsah dat u dlouhých úseků;
   - přilepené nadpisy bez prosvítání.
2. **Automatika v2:** jeden průběh pro celou cestu, rozpoznání vícedenního treku,
   názvy etap z míst, spojení drobných momentů do zastávek.
3. Přehled dnů a lišta úkolů.
4. Detail dne (včetně tabulky zápisů ke dni).
5. Detail etapy a návrh uspořádání na časovém pásu.
6. Výběr nejlepších.

Prototyp je závazná vizuální předloha (karty dnů, detail dne, etapa, mapa s bublinami). Každá
obrazovka se navrhuje i ověřuje také na mobilu (~390 px): detail dne přes celou obrazovku,
etapy jako vodorovný pás nad dny, mapa jako přepínač.

Brána: na Kanadě je trek kolem Mt Assiniboine (26. 9. – 1. 10.) jedna etapa, žádné
duplicitní názvy etap, žádný čas v UTC a celou cestu jde projít po dnech bez scrollování
přes stovky fotek.

#### Fáze 4d — Mobilní editace a třídění dávky (iOS, 2026-10-22, 📝 PROPOSED)

Výchozí stav: plocha, detail dne, Výběr nejlepších a koš jsou jedna React aplikace
pro web i iOS (Capacitor). Funkce na iOS tedy existují, ale ovládání je odvozené
z desktopu a na iPhonu je neověřené. Nativní jsou jen PhotoKit, export médií a upload
videí na pozadí. Slabá místa mobilu:

- vstup do výběru fotek je jen malý kruh v rohu dlaždice (chip „Vybrat fotky“ je
  v postranním panelu, který je na úzké obrazovce skrytý); chybí podržení a tažení;
- Výběr nejlepších je navržený na klávesy; chybí velká tlačítka dole a haptika;
- přesun fotek je výběr ze seznamu zastávek; chybí „do předchozí / další zastávky“;
- import ukazuje jen počty a řádky fronty, ne co se právě nahrálo; fotky se nahrávají
  JS frontou, která se po uspání aplikace zastaví (videa běží na pozadí nativně).

Rozhodnutí (2026-10-22):

- **Třídění až po nahrávání.** Nahrávání je samostatná obrazovka (průběh, pauza,
  opakování); souběžné třídění se nedělá.
- **Rozsah: stovky médií na dávku.** Nad ~500 položek import uživatele varuje
  a nasměruje na rozdělení podle rozsahu dat. Virtualizace seznamu není potřeba,
  stačí líné miniatury (ověřit na zařízení).
- **Foťák a „Sdílet do aplikace“ nejsou součástí fáze.**
- **Stav „roztříděno“ v databázi: varianta A,** `media.reviewed_at` (timestamptz,
  null = čeká na roztřídění). Funguje po restartu i na webu. Migrace a pgTAP
  (RLS: jen člen s právem úprav) jsou první krok, který navrhuje `db-specialist`
  ještě před kódem.

Rozhodnutí po schválení mockupu M0 (2026-10-22, mockup schválen):

- **Co je „roztříděno“:** přesun do zastávky, nová zastávka, koš a „Hotovo“
  nastaví `reviewed_at`. Samotná ★ ne.
- **Roztříděné fotky z dávky mizí;** zbývá jen to, co čeká. Chybu vrací Undo (toast).
  Žádný filtr „Roztříděné“.
- **Výběr tažením:** souvislý rozsah v pořadí čtení, ne obdélník.
- **Pevný limit 500 médií na dávku.** Větší výběr se nespustí; aplikace nabídne
  rozdělení podle rozsahu dat. Žádné „nahrát přesto“.
- **Rychlé třídění** je vstup z dávky a je i na webu (stejná aplikace; na webu navíc
  klávesy jako ve Výběru nejlepších).
- **Na jindy:** tmavý režim. Aplikace má zatím jen světlé tokeny; paleta z mockupu je
  jen návrh.

Kroky:

1. **M0 — ověření a mockup.** Projít stávající plochu na iPhonu (kroky 3–6 Fáze 4c,
   výkon posunu, paměť WKWebView, klávesnice u zápisu dne). Klikací mobilní mockup
   tří obrazovek (průběh nahrávání, dávka k roztřídění, rychlé třídění) ke schválení;
   po schválení je závazná předloha.
2. **DB.** `media.reviewed_at`, RPC pro označení roztříděného (hromadně), pgTAP,
   generované typy.
3. **M1 — dávka k roztřídění.** Po dokončení nahrávání obrazovka s mřížkou po dnech,
   počítadlo „zbývá roztřídit“, tlačítko „Uspořádat automaticky“. Nové záložky
   mobilní navigace (spodní lišta místo řady záložek).
4. **M2 — dotykové třídění.**
   - Rychlé třídění: velká fotka, tlačítka ★ / další / koš dole, swipe nahoru = koš,
     haptika, Undo. Logika zůstává v `model/cull.ts`, mění se jen UI.
   - Mřížkový výběr: podržení spustí výběr, tažení označí rozsah (nahrazuje Shift),
     spodní lišta akcí.
   - „Přesunout do“ jako spodní list s náhledy zastávek a tlačítky předchozí / další.
5. **M3 — odolnost nahrávání.** Displej zůstává zapnutý, `beginBackgroundTask`
   dokončí rozpracovanou fotku a fronta naváže po návratu. Plný background
   `URLSession` pro fotky je volitelný spike až podle výsledků M0.
6. **M4 — dodělat neaktivní akce:** sloučit zastávky, přesunout do jiného dne,
   rozdělit den (na mobilu jako akce nad výběrem).

Brána: dávka ~300 fotek se z iPhonu nahraje a roztřídí do zastávek jen telefonem;
zamčení telefonu nebo přepnutí aplikace uprostřed nahrávání nic neztratí ani nezdvojí;
každá nová obrazovka je ověřená na zařízení a ve ~390 px.

### Fáze 5 — Prezentační vrstva

- **Rozhodnutí na začátku fáze:** předgenerované veřejné stránky (při publikaci)
  vs. SSR. Doporučení: veřejná cesta se načte **jedním dotazem** (RPC vracející celý
  strom cesty). Veřejné routy se předgenerují kvůli rychlosti, SEO a náhledům při
  sdílení. Komponenty zůstávají sdílené s aplikací.
- Stránky:
  - **Cesta:** mapa s trasou obarvenou podle etap, karty etap, časová osa;
  - **Etapa:** regionální mapa, text, výlety jako kapitoly;
  - **Výlet / trek:** trasa a převýšení, vyprávění po dnech, vybrané fotky;
  - **Moment:** navázat na současný detail;
  - **Průřezy:** tagy („všechna zvířata“), místa, tipy, profil s titulní fotkou a popisem.
- Mapa:
  - piny s náhledem fotky a shlukování;
  - zoom kolečkem jen s Ctrl (`cooperativeGestures`), správné chování při změně velikosti.
- Obrázky z R2 přes CDN Cloudflare s `srcset` z předgenerovaných variant. Video
  jako progresivní MP4 s posterem.
- **Srdíčka a komentáře bez registrace:**
  - anonymní přihlášení Supabase, ochrana Turnstile a omezení počtu požadavků;
  - komentáře hostů se zobrazí až po schválení autorem (fronta ke schválení v owner UI);
  - host zadá jen jméno.
- **Výkonnostní rozpočet (brána):**
  - LCP < 2,5 s na 4G (mobil);
  - ≤ 5 datových požadavků při prvním vykreslení;
  - CLS < 0,1;
  - Lighthouse ≥ 90 (výkon i přístupnost);
  - žádný prázdný stav „Načítám…“ na veřejných stránkách.

### Fáze 5b — Atlas čtenáře (redesign veřejných stránek) — 📝 PROPOSED

Veřejné stránky (Fáze 5) jsou funkční a rychlé, ale vizuálně i obsahově zaostávají za
editací („Atlas cesty“, Fáze 4c). Redesign je **závazně** daný klikacím návrhem.
Návrh je v repozitáři: `docs/design/atlas-ctenare.html` (otevřít v prohlížeči, přepínač
Cesta / Etapa / Zastávka a Desktop / Mobil 390, lightbox je klikací) a snímky
`docs/design/atlas-ctenare-{journey,stage,moment}-{desktop,mobile}.png`. **Před každým
krokem si snímky prohlédnout** (nástroj pro čtení obrázků) a výsledek porovnat se
screenshoty 1400 px a 390 px. Fotky v návrhu jsou zástupné barevné plochy, ne předloha
obsahu. Odkaz na soukromý artefakt (https://claude.ai/artifact/BBV29NzQphUvvestG2FfNx)
cloudový agent nemusí otevřít. Musí fungovat i ve ~390 px.

**Pravidlo pro poměry stran fotek (platí pro veřejnou část i editaci):** žádná fotka se
nezobrazuje jako nízký široký pruh. Dlaždice a hrdinské fotky mají poměr stran
v rozmezí 4:3 až 16:9 (hrdinská), 3:4 až 16:9 (dlaždice v řadě), panorama se ořízne
(`object-cover`) a vcelku ukáže teprve lightbox. Hrdinská fotka nikdy nezabírá celou
šířku řádku (max ~36 rem, nebo 16:9 v rámci sloupce textu) a výška řádku dlaždic je ≥ 130 px.
V editaci je to opraveno v `ui/day/DayStops.tsx` a `ui/day/media-url.ts`
(`aspectOf(item, min, max)`); stejné pravidlo převzít do veřejné části a zkontrolovat
další místa (`MediaTiles`, `DayCard` mozaika, `MediaGallery`, karty etap).

**Zjištěný stav (produkce, 2026-10-22, cesta o 9 000 px s 309 fotkami v jedné etapě):**

- Stránka etapy je zeď odkazů „Moment“ bez fotek a bez textu: `PublicSegmentPage` vypisuje
  jen název momentu (často prázdný → „Moment“) a ořezaný text; fotky etapy jsou až na
  konci jako „Vybrané fotky“.
- `get_public_journey` už vrací `dayNotes` (zápis dne z editace, migrace
  `20261023120000`), ale Zod schéma `publicJourneySchema` je zahazuje a UI je nezná.
  Nejlepší autorský text tedy veřejnost nevidí.
- Cesta: pouhý obdélník s covery, žádné statistiky, žádný přehled délky etap, časová
  osa je seznam odkazů. Mapa je oddělená od etap (bez vazby legenda ↔ trasa).
- Etapa: žádný postup mezi etapami (předchozí/další), žádná mapa vedle textu, žádná
  navigace po dnech. Moment: malý obrázek v řadě, bez celoobrazovkové fotky.
- Lightbox `MediaGallery`: bez swipe, bez počitadla, bez návratu fokusu, bez preloadu
  sousedních fotek. Stránky nepoužívají `reader-display` ani karty z editace
  (`PublicSpace*` ano, `PublicJourney*` ne), takže veřejný profil a cesta vypadají jako
  dvě různé aplikace.
- Obrázkové dlaždice mají prázdné šedé pozadí do načtení (lazy), bez blur-up.

**Co dělají konkurenti (obecné poznatky, UNVERIFIED detaily):** Polarsteps: mapa trasy
nahoře, časová osa kroků s fotkami a textem, srdíčka a komentáře; Journi / Steller /
FindPenguins: fotka jako hrdina, vyprávění po dnech s prokládanými fotkami; Komoot a
Strava: statistiky trasy (km, převýšení, čas) jako hlavní „čísla“; Google Photos
sdílená alba: mozaika a plynulý lightbox se swipem. Společné jádro: **den je základní
jednotka čtení**, fotky jsou součástí textu, mapa je vždy po ruce, čísla jsou vidět
hned, navigace dopředu/zpět je jedním klepnutím.

**Vizuální pravidla (z návrhu):**

- Stejné tokeny a písma jako editace (`src/index.css`); nadpisy `reader-display`;
  barva etapy (`STAGE_COLORS` / `STRIP_PALETTE`, sjednotit na jednu paletu) je rozlišovací
  prvek na čáře mapy, štítku karty, pásu etap i miniaturách v legendě.
- **Cesta:** celostránková titulní fotka s názvem, daty a řadou čísel (dní, etap, km,
  fotek) → lepicí navigace sekcí (Trasa, Etapy, Místa) → pás etap úměrný počtu dní →
  mapa + legenda etap (kulatá miniatura s barevným kroužkem, jako sbalený rail v editaci;
  najetí zvýrazní trasu etapy) → karty etap (první velká, ostatní ve dvou sloupcích,
  mozaika 2/1/1 jako `DayCard`) → místa → srdíčka a komentáře.
- **Etapa:** drobečky, štítek „Etapa N z M“, pás etap se zvýrazněnou aktuální, úvodní
  text serifem, řádek statistik. Desktop ≥ 1000 px: levý rail dnů (sticky), uprostřed
  dny, vpravo lepicí mapa etapy; mobil: vodorovné čipy dnů (sticky) a mini mapa.
  **Den = sekce:** nadpis dne + „Den N“, řádek míst, mozaika fotek (klepnutím lightbox),
  zápis dne (`dayNotes`), karta výletu/treku (typ, km, převýšení, čas), seznam zastávek
  jako řádky s miniaturou, názvem, časem a prvním řádkem textu. Dole předchozí/další
  etapa.
- **Moment (zastávka):** fotka přes celou šířku s popiskem, název, čas a místo, text
  serifem (max ~65 znaků), filmový pás ostatních fotek, srdíčko, plovoucí lišta
  „↑ Etapa · 4/11 · Další →“. Název bez titulku: první věta textu nebo místo, nikdy
  holé „Moment“.
- **Lightbox:** počitadlo, popisek, srdíčko, swipe a šipky, Esc, návrat fokusu,
  preload sousedních fotek, pinch na mobilu.
- **Výkon se nesmí zhoršit:** předgenerované stránky (`scripts/prerender-public.mjs`),
  hero z embedded kopie, mapa líně po `load`, rezervované rozměry (CLS < 0,1). Rozpočet
  Fáze 5 platí dál; každý krok se měří (Lighthouse mobil) před a po.

**Kroky (v tomto pořadí, každý samostatný PR, bez změny DB kontraktu kromě kroku 1):**

1. **Data:** `dayNotes` do `publicJourneySchema` + `fixtures/public-journey.json`
   (syntetická data!), do `JourneyModel` (`dayNoteByDate`, den v pásmu etapy),
   test na hranici dne. Žádná změna RPC (už hotové).
2. **Základ:** sdílené stavební kameny ve `features/public-journey/ui`: `StatRow`,
   `StageStrip` (pás etap), `StageBadge`, `DayMosaic` (sdílet s `DayCard` z editace přes
   `shared/ui`), `StopRow`, `Crumbs` v novém stylu. Sjednotit barvy etap s editací.
3. **Stránka cesty:** nová hlavička, statistiky, lepicí navigace, mapa + legenda,
   karty etap, místa. Aktualizovat skeleton i statický shell prerenderu (stejné rozměry).
4. **Stránka etapy a výletu:** den jako sekce, rail/čipy, lepicí mapa, zápis dne,
   karta treku, předchozí/další. Dlouhé etapy: dny pod ohybem se vykreslují líně
   (`content-visibility: auto`), fotky max. 3 na den v mozaice.
5. **Moment a lightbox:** nový detail, plovoucí lišta, swipe, preload, přístupnost
   (fokus, `aria-live` počitadlo).
6. **Mapa:** propojení legenda ↔ trasa ↔ den (hover/fokus), zvýraznění etapy,
   shluky v barvách etapy; ověřit na 300+ pinech.
7. **Detaily a dodělávky:** blur-up/dominantní barva z `variants`, `prefers-reduced-motion`,
   tmavý režim (volitelné, jen pokud sdílí tokeny s aplikací), titulek momentu bez názvu,
   OG obrázky/náhledy sdílení (kontrola), prázdné stavy (etapa bez fotek, cesta bez trasy).

**Brána (podmínky dokončení):** `pnpm check` zelený; Playwright E2E veřejné cesty
(cesta → etapa → moment → lightbox → zpět) na desktopu a ve 390 px; Lighthouse mobil
≥ 90 výkon i přístupnost na prerenderované cestě; ruční kontrola v prohlížeči
(screenshoty 1400 px a 390 px) proti návrhu; žádné skutečné fotky ani souřadnice
Kanady v repozitáři (je veřejný); nepřibývá jiná závislost než případný swipe
(preferovat vlastní pointer events).

### Fáze 6 — Rozšíření (až po v2)

- Checklisty, překlady a přírodovědné funkce nad tagy druhů.
- Android.
- Otevření registrace veřejnosti: onboarding, kvóty úložiště na uživatele, moderace.

---

## 6. Cílová struktura Kanady (referenční příklad pro testy i UI)

```
Kanada 2026
├─ Calgary                          etapa
├─ Rockies                          etapa
├─ Workaway u Vernonu               etapa (pobyt)
├─ Na sever                         etapa
│   ├─ Vancouver Island             výlet(y)
│   ├─ Trajekt Port Hardy → Prince Rupert   přesun
│   ├─ Cassiar Highway              přesun
│   │   └─ Salmon Glacier           výlet
│   ├─ Atlin · Skagway + Haines · Kluane NP
├─ Workaway Whitehorse              etapa (pobyt)
├─ Dawson City + Tombstone          etapa
├─ Alaska Highway                   etapa / přesun
└─ Zpět v Rockies                   etapa
    ├─ Lake Magog / Assiniboine     trek (6 dní)
    └─ Jednodenní treky u Canmore   výlety
```

---

## 7. Testovací strategie

| Vrstva              | Nástroj                              | Co hlídá                                    |
| ------------------- | ------------------------------------ | ------------------------------------------- |
| DB                  | pgTAP                                | RLS, constrainty, RPC, migrace v1→v2        |
| Doména a automatika | Vitest + fixture Kanady              | shlukování, návrhy, časová pásma, stabilita |
| Synchronizace       | Vitest + fake IndexedDB              | outbox, idempotence, konflikty, výpadky     |
| Nativní pluginy     | XCTest + ruční checklist na zařízení | import, převod, upload na pozadí            |
| UI                  | Playwright                           | hlavní toky psaní a veřejné stránky         |
| Výkon               | Lighthouse CI                        | rozpočet z Fáze 5                           |

Každá fáze má **checklist na fyzickém zařízení** (iPhone), který se odškrtne před
uzavřením brány. Výsledky se zapisují do jednoho souboru `docs/v2-status.md` místo
dalších samostatných reportů.

---

## 8. Rizika

| Riziko                                                          | Dopad                        | Opatření                                                                                    |
| --------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| PhotoKit nevrátí polohu (omezený přístup, sdílená alba, iCloud) | Ztráta hlavní automatiky     | Spike A, fallback na EXIF ze souboru, upozornění v UI                                       |
| Upload na pozadí na iOS se nedokončí (systém aplikaci ukončí)   | Rozpracované uploady         | Background `URLSession` + navázání po částech (TUS), stav fronty na disku                   |
| Objem médií přesáhne 10 GB R2                                   | Drobné náklady               | Bez originálů, video ≤ 60 s, hlídání obsazení; nad limit řádově desítky Kč měsíčně          |
| Free limity se změní                                            | Nutnost platit nebo migrovat | Úložiště za rozhraním (S3 API), přechod na jiný S3 kompatibilní provider je jen konfigurace |
| Spam v komentářích hostů                                        | Nevhodný obsah               | Turnstile, limity požadavků, schvalování autorem                                            |
| Automatika rozhodí ruční úpravy                                 | Ztráta důvěry                | Zámky, `origin`, idempotence, testy stability                                               |
| Migrace v1→v2 ztratí data                                       | Nevratné                     | Kopie produkce, automatická kontrola počtů, v1 tabulky 30 dní jen pro čtení                 |
| Rozsah znovu naroste                                            | Plán se nedokončí            | Fáze 6 je jediné místo pro nové nápady                                                      |

---

## 9. Rozhodnutí (2026-10-09)

1. **Android:** zatím ne. Fáze 0–5 jen iOS a web.
2. **Uživatelé:** cílem je i veřejnost, zatím rodina, přátelé a známí. Model a RLS se
   navrhují pro víc uživatelů, otevření registrace je ve Fázi 6.
3. **Zmrazení:** checklisty, překlady a přírodovědný modul čekají na Fázi 6.
   **Srdíčka a komentáře zůstávají**, i pro hosty bez registrace (Fáze 5).
4. **Bez placení:** Supabase Free + Cloudflare R2 (free tier) pro média (kap. 3.1).
5. **Video:** do 60 s, 1080p.
6. **Plánování:** z produktu mizí.
7. **Originály médií** se na server neukládají, zůstávají v knihovně fotek
   nebo v iCloudu (kvůli kapacitě).
8. **Pracovní plocha (2026-10-18):** smazání fotky jde do koše na 30 dní. Skrývání
   z veřejné stránky nebude, stačí smazání. Den je jen odvozená úroveň v UI. Názvy
   z míst jsou vždy jen návrh ke schválení. Pořadí P1 → P2 → P3 (kap. 5, Fáze 4b).
9. **Atlas cesty (2026-10-21):** moment se v rozhraní jmenuje **zastávka** (v datech
   zůstává `moments`). Etapa zůstává etapou (název „kapitola“ zamítnut). Zápis ke dni
   ano, vedle textů fotky, zastávky, výletu, etapy a cesty. Detail dne je panel
   s vlastní adresou. Výběr nejlepších ano. Pořadí kap. 5, Fáze 4c.
