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

#### Fáze 4e — Třídírna a návrat k vzpomínkám (2026-10-24, 📝 PROPOSED)

Vychází z UX review 2026-10-24 (`REFACTOR_PLAN.md`, oddíl L) a z klikací vize (soukromý
artefakt, 23 obrazovek: https://claude.ai/artifact/7zU3hQNM316snfxkz4bHo7). Vize je
**návrh ke schválení**, ne závazná předloha, dokud ji uživatel neodsouhlasí. Navazuje na
4d (mobilní třídění) a upřesňuje ji; kde se liší, rozhodne schválení.

Zjištění, ze kterých se vychází:

- Třídění je rozdělené na tři místa (Dávka, Výběr nejlepších, prohlížeč), která si
  překrývají akce. Z dávky se z celé obrazovky nedá fotka zařadit.
- Navigace jsou záložky na jedné úrovni (7 položek) bez pořadí práce; správa (Členové,
  Koš) stojí vedle hlavního postupu. Dashboard nemá fotky ani počet k roztřídění.
- Slovník (moment × zastávka, tykání × vykání, čtyři názvy pro ★) je nejednotný.
- Chybí věci, které třídění stovek fotek urychlují: série podobných, doporučení nejlepší,
  zoom a porovnání, oprava času a polohy hromadně, filtry a hledání, viditelný postup.

Principy vize:

1. **Jeden režim třídění** (mobil i web): Rychlé třídění je vstup z dávky, ze dne i po
   nahrání. Mřížka dávky zůstává pro hromadné akce.
2. **Co dál místo seznamu nástrojů.** Domů a Přehled cesty říkají jedním tlačítkem, co
   pomůže nejvíc (roztřídit N, napsat zápis, schválit návrh etapy).
3. **Stav dne se odvozuje, neukládá se.** „Fotky roztříděné“ = všechna média dne mají
   `reviewed_at`. „Zápis“ = existuje `day_notes`. Žádná nová tabulka stavů.
4. **Automatika navrhuje, člověk potvrzuje.** Návrh zastávky, doporučená fotka v sérii
   a osnova zápisu dne jsou deterministické funkce v `packages/core` bez AI služby.
5. **Soukromí napřed** u všeho, co vychází ven (poloha, e-maily sledujících).

##### Mapa obrazovek vize ↔ úkoly

| Obrazovka vize                                | Úkoly             |
| --------------------------------------------- | ----------------- |
| Domů: co dál, spodní navigace, rychlé přidání | UX-10, 11, 12     |
| Nahrávání (průběh, miniatury, chyby, Wi-Fi)   | UX-13             |
| Rychlé třídění (mobil) a Třídírna (web)       | UX-30, 33, 34, 37 |
| Série podobných                               | UX-31, 32         |
| Dávka, výběr tažením, Přesunout do            | UX-35, 36         |
| Prohlížeč fotky, oprava času a polohy         | UX-36, 40, 41     |
| Hotovo se dnem, stav dne                      | UX-38, 39         |
| Přehled cesty, Den (web a mobil), Mapa        | UX-14, 15, 39     |
| Hledání a filtry                              | UX-42, 43         |
| Sdílení a poloha pro rodinu, příběh k sdílení | UX-50 až 53       |
| Kniha z cesty                                 | UX-60 až 62       |
| Prázdné a chybové stavy, tmavý režim          | UX-16, 17         |

##### DB kontrakt (návrh, vše aditivní; pořadí migrací = pořadí v tabulce)

Pravidlo CLAUDE.md platí: DB se dohodne a zmigruje dřív, než na ní závisí web nebo iOS.
Každá migrace má pgTAP test (RLS: vlastník, editor, člen, host, anon) a přegenerované
typy (`pnpm db:types`). Nové RPC kopírují konvenci `media_batch_journey` a kódy chyb
`P0002` / `42501` / `22023`, `security definer`, `set search_path = ''`, `revoke` + `grant`
jen `authenticated` (kde není uvedeno jinak).

| #   | Migrace (návrh názvu)                 | Obsah                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Proč                                                                               |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| D1  | `20261025120000_v2_media_analysis`    | `media.phash bigint` (49bitový dHash 8×7, aby se vešel do přesného celého čísla v JS; 64 bitů by se při čtení z Supabase tiše zkomolilo), `media.quality jsonb` (`{v, sharp, exposure, eyesClosed?}`, objekt, < 2 kB). Nullable, bez defaultu. Do sloupcových grantů insert/update patří jen u vlastníka média. Žádný index, shluky se počítají na klientu. Série se **neukládají**, odvozují se z `phash` + `captured_at` čistou funkcí.                                                   | Série podobných a doporučení nejlepší (UX-31). Zachová idempotenci a ruční zásahy. |
| D2  | `20261025120100_v2_media_corrections` | `media.captured_at_source text` (`exif`/`gps`/`file`/`manual`, null = neznámé) a `media.location_source text` (`exif`/`manual`). RPC `shift_media_time(p_media_ids uuid[], p_delta_seconds int)` (\|delta\| ≤ 366 dní) a `set_media_location(p_media_ids uuid[], p_latitude, p_longitude)`. Obě jen editor, ignorují koš, vrací počet změněných řádků. Neřeší `moment_id`; přeřazení udělá klient idempotentním „Uspořádat“, zamčené a ruční zastávky zůstanou.                             | Cizí foťák, dron, špatné hodiny, fotky bez GPS (UX-40, 41).                        |
| D3  | `20261025120200_v2_journey_progress`  | RPC `journey_progress(p_journey_ids uuid[])` (čtení pro členy): za cestu `days_total`, `days_with_note`, `media_total`, `media_unreviewed`, `starred`, `cover_media_id`. Dny podle `home_tz` jako u `day_notes`. Jen čtení, žádná tabulka.                                                                                                                                                                                                                                                  | Dashboard, odznak třídění, postup (UX-14, 38).                                     |
| D4  | `…_v2_search`                         | Rozšíření `unaccent`, generovaný `tsvector` (`simple` + `unaccent`) na `moments(title, body)`, `day_notes(body)`, `places(name)`, `media(caption)`; GIN indexy; RPC `search_journey(p_journey_id, p_query, p_limit)`. Filtry ★, video, bez polohy, bez popisku, tag jdou lokálně v Dexie.                                                                                                                                                                                                   | Hledání (UX-42). Až po 4e-B.                                                       |
| D5  | `…_v2_live_position`                  | `journeys.live_enabled bool default false`, `live_delay_minutes int default 180 (0–1440)`, `live_precision text default 'city'` (`exact`/`area`/`city`). Tabulka `journey_live_positions` (`journey_id`, `recorded_at`, `latitude`, `longitude`, `accuracy_m`); insert jen editor; anon bez přístupu. Veřejné `get_public_live_position(handle, slug)` vrací nejnovější bod **starší než zpoždění**, zaokrouhlený podle přesnosti, jinak `null`. Mazání starších než 30 dní přes `pg_cron`. | Sledování pro rodinu (UX-50). **Vyžaduje rozhodnutí o soukromí** (níže).           |
| D6  | `…_v2_journey_followers`              | `journey_followers` (`journey_id`, `actor_id`, `email` nullable, `digest_hour`, `tz`, `unsubscribed_at`). RLS: host vidí a mění jen svůj řádek, vlastník počet, ne e-maily. Odesílání viz rozhodnutí o kanálu.                                                                                                                                                                                                                                                                              | Denní souhrn (UX-52). Až po rozhodnutí o kanálu.                                   |
| D7  | `…_v2_journey_stats`                  | RPC `get_journey_stats(p_journey_id)` (člen) a klíč `stats` ve `get_public_journey`: dny, km (`tracks.distance_m`, jinak odvozené z médií), fotky, ★, počet `captured_tz`, nejvyšší `altitude`, nejsrdíčkovanější médium. Bez tabulky.                                                                                                                                                                                                                                                      | Příběh k sdílení a statistiky (UX-53).                                             |
| D8  | `…_v2_journey_books`                  | `journey_books` (`id`, `journey_id`, `theme`, `options jsonb`, `layout jsonb`, `created_by`, `updated_at`). RLS jako `day_notes`. PDF se **neukládá**, skládá se na klientu z toho, co v cestě je.                                                                                                                                                                                                                                                                                          | Kniha z cesty (UX-60 až 62).                                                       |

Bez změny DB: Rychlé třídění (používá `move_media`, `create_moment_from_media`,
`trash_media`, `mark_media_reviewed`, ★), návrh zastávky (čistá funkce v `core`),
filtry v dávce, osnova zápisu dne, hlasový zápis (přepis v zařízení, do `day_notes`
nebo momentu jako text), Domů a spodní navigace, tmavý režim.

##### Úkoly (stav všech: 📝 PROPOSED)

Skupiny A–C jsou jádro 4e. Skupiny D–G jdou po schválení a po ověření A–C na zařízení.

| ID    | Úkol                                                                                                                                                                                                   | Role                    | Závisí na      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | -------------- |
| UX-00 | Schválit vizi a rozhodnutí níže; ověřit M0 z 4d na iPhonu (výkon posunu, paměť WKWebView)                                                                                                              | uživatel + orchestrátor | —              |
| UX-01 | **Rychlé výhry** (bez DB): dvojité šipky v `dayDetail`, skrýt neaktivní „Sloučit zastávky / Přesunout do jiného dne“, jednopoložkové „⋯“, nulové stavové pilulky ve frontě importu, ARIA účtového menu | app                     | —              |
| UX-02 | **Slovník a hlas:** jedno slovo zastávka (UI), tykání v celém `cs.ts`, jedno sloveso pro ★ („Nejlepší“), „Třídění“ místo „Dávka“, „Vyřízeno“ místo „Hotovo“ s popiskem; totéž v `en.ts`                | app                     | —              |
| UX-03 | Dotykové cíle ≥ 44 px (výběr fotky), nápověda kláves ve Výběru nejlepších, silnější stav přepínačů                                                                                                     | app                     | —              |
| UX-10 | Spodní navigace na mobilu: Domů, Třídění (odznak), +, Mapa, Čtení; na webu záložky v pořadí práce                                                                                                      | app                     | UX-02          |
| UX-11 | Domů: karta „Teď nejvíc pomůže“ z modelu úkolů (`workspace-tasks`) včetně dávky; pás Před měsícem                                                                                                      | app                     | D3             |
| UX-12 | Rychlé přidání (+): zápis, fotka, hlas (přepis v zařízení; bez ukládání zvuku)                                                                                                                         | app                     | —              |
| UX-13 | Obrazovka nahrávání: celkový postup „N z M“, odhad času, miniatury hotových, opakování po položce, Wi-Fi jen                                                                                           | app (+ iOS plugin)      | 4d M3          |
| UX-14 | Dashboard: titulní fotka, počty, „k roztřídění“, postup; Přehled cesty: stav dne (prázdný, rozpracovaný, hotový) na kartách dnů                                                                        | app                     | D3             |
| UX-15 | Správa cesty (Členové, Koš, Sdílení, Nastavení) z primárních záložek do jedné nabídky                                                                                                                  | app                     | UX-10          |
| UX-16 | Prázdné, chybové a offline stavy sjednocené (komponenta + texty)                                                                                                                                       | app                     | —              |
| UX-17 | Tmavý režim (tokeny v `src/index.css`), nejdřív obrazovky třídění, pak celá aplikace                                                                                                                   | app                     | —              |
| UX-30 | Rychlé třídění v dávce a ze dne: velká fotka, Koš / Nejlepší / Do zastávky, návrh zastávky, Zpět, tah nahoru = koš; logika zůstává v `model/cull.ts`, přibývá `suggestStop` v `core`                   | app                     | UX-02          |
| UX-31 | `clusterSeries` a `recommendBest` v `packages/core` (dHash, Hamming ≤ N, okno 90 s, ostrost z variance Laplaciánu); výpočet při importu (web worker, iOS) → `phash`, `quality`                         | db → app                | D1             |
| UX-32 | Obrazovka Série podobných (mobil, web): doporučená, porovnání dvou, „nechat tuhle“, „nechat víc“                                                                                                       | app                     | UX-31          |
| UX-33 | Třídírna na webu: dva snímky vedle sebe, zoom, pás náhledů, zkratky (Enter potvrdí zastávku, G série, C porovnat, Z zoom)                                                                              | app                     | UX-30          |
| UX-34 | Odznak ostrosti na dlaždici a v prohlížeči (jen z `quality`, bez AI služby)                                                                                                                            | app                     | UX-31          |
| UX-35 | Dávka: filtry (Bez polohy, Série, Videa), výběr podržením a tažením (rozsah v pořadí čtení), spodní list Přesunout do s předchozí/další zastávkou                                                      | app                     | UX-02          |
| UX-36 | Prohlížeč v dávce se skutečnými cíli (přesun, vyjmutí do nové zastávky, obálka); po akci označí jako vyřízené                                                                                          | app                     | —              |
| UX-37 | Haptika (Capacitor Haptics, **nová závislost: schválit**)                                                                                                                                              | app                     | UX-30          |
| UX-38 | „Hotovo se dnem“: souhrn dne (★, koš, zastávky) a návrh dalšího kroku (zápis dne, další den)                                                                                                           | app                     | D3, UX-30      |
| UX-39 | Odvozený stav dne ve všech seznamech (jeden model `dayStatus` v `journey-workspace/model`)                                                                                                             | app                     | D3             |
| UX-40 | Oprava času hromadně: posun o ±h/min s náhledem, předvolby podle pásma; Zpět inverzním posunem                                                                                                         | db → app                | D2             |
| UX-41 | Umístit na mapě (fotky bez GPS): výběr + špendlík, `set_media_location`                                                                                                                                | db → app                | D2             |
| UX-42 | Filtry a hledání: lokální filtry (★, video, bez polohy, bez popisku, tag) a celotextové hledání ⌘K                                                                                                     | db → app                | D4             |
| UX-43 | Odznaky „kdo nahrál“ u společných cest (z `media.owner_id`, bez změny DB)                                                                                                                              | app                     | —              |
| UX-50 | Sledování pro rodinu: nastavení soukromí (zpoždění, přesnost, vypnout), iOS odesílání polohy, veřejná stránka „Kde jsme teď“                                                                           | db → app                | D5, rozhodnutí |
| UX-51 | Pozdrav cestovateli: komentář k cestě od člena bez schvalování (ověřit `guard_content_comment_insert`)                                                                                                 | db? → app               | UX-50          |
| UX-52 | Denní souhrn (kanál po rozhodnutí): e-mail přes poskytovatele, nebo Atom/RSS kanál                                                                                                                     | db → edge → app         | D6, rozhodnutí |
| UX-53 | Příběh k sdílení (obrázek z `get_journey_stats`, vykreslení na klientu), statistiky v hlavičce cesty                                                                                                   | db → app                | D7             |
| UX-60 | Kniha z cesty: skladba stran jako čistá funkce v `core` (kapitoly = etapy, ★ a zápisy), kontrola rozlišení fotek                                                                                       | app                     | —              |
| UX-61 | Editor knihy (kapitoly, vzhled, co zahrnout, dvoustrany) a nastavení v `journey_books`                                                                                                                 | db → app                | D8, UX-60      |
| UX-62 | Export PDF (tisk z prohlížeče s `@page`, nebo knihovna: **rozhodnutí o závislosti**)                                                                                                                   | app                     | UX-61          |

**Brána 4e (A–C):** dávka ~300 fotek se z iPhonu nahraje a roztřídí jen telefonem do 15 minut
(cíl, **UNVERIFIED**); na ruční vzorku 100 sérií se doporučený snímek shoduje s volbou
člověka alespoň v 80 % (cíl, **UNVERIFIED**); žádné `new Date()` jako čas zážitku;
`pnpm check` a `pnpm db:test` zelené; každá nová obrazovka ověřená na zařízení a ve ~390 px
a ve 1400 px; slovník a tykání bez zbytků (kontrola `grep` v testu překladů).

##### Rozhodnutí (2026-10-24: uživatel schválil všechny návrhy níže a vizi obrazovek)

1. **Poloha pro rodinu:** zapnout vůbec? Výchozí návrh: vypnuto, zpoždění 3 h, přesnost
   „město“, mazání po 30 dnech. Poloha se nikdy nezveřejňuje přesněji, než dovolí nastavení,
   a zaokrouhluje se **na serveru**.
2. **Kanál denního souhrnu:** e-mail (potřebuje poskytovatele a tajný klíč, např. bezplatný
   tarif; ověřit limity a podmínky), nebo Atom/RSS (zdarma, bez účtu). Doporučení: začít
   Atom/RSS, e-mail až když o něj rodina stojí.
3. **Nové závislosti:** Capacitor Haptics, případně PDF knihovna a knihovna pro obrázek
   příběhu. Doporučení: žádná PDF knihovna v první verzi (tisk z prohlížeče), obrázek
   příběhu vykreslit přes `canvas`.
4. **Hlas:** jen přepis v zařízení (iOS Speech / Web Speech API), zvuk se neukládá.
   Ukládání zvuku (`media_kind = 'audio'`, R2) je **DEFERRED**.
5. **Návrh zápisu dne** zůstane deterministický (osnova ze zastávek a časů). Text psaný
   jazykovým modelem je **DEFERRED** (soukromí, cena, tajné klíče).
6. **Pořadí:** doporučení UX-01 až 03 hned (bez DB), pak D1 až D3 + UX-30 až 39, ostatní
   skupiny až po zařízení.

Rizika: detekce ostrosti a zavřených očí na zařízení je **UNVERIFIED** (výkon, přesnost;
první krok UX-31 je krátký spike na 300 fotkách); `phash` vyžaduje dekódování obrázku při
importu, což prodlouží import (měřit); tisk knihovny vyžaduje fotky v rozlišení, které se
neukládá (originály zůstávají v knihovně) — kniha musí varovat u malých fotek.

#### Fáze 4f-B — Chytřejší automatika a třídění v telefonu (navazuje na ZS níže) (2026-10-29, 📝 PROPOSED)

Vychází z revize čtyř specifikací (algoritmus bez AI, čtenář, editace na webu, editace
v aplikaci) a drátěných mockupů vůči stavu kódu. Mockupy jsou **jen inspirace, ne závazná
předloha**: náš čtenář (Fáze 5b) je vizuálně dál. Specifikace ani mockupy nejsou v repozitáři.
Nic z fáze není implementované ani ověřené (**UNVERIFIED**), prahy jsou výchozí návrh, ne dogma.

##### Rozhodnutí (2026-10-29, uživatel)

1. **Třídění před nahráváním jen v mobilní aplikaci (iOS).** Pořadí: metadata → malé
   náhledy → plné varianty jen vybraných fotek. Tím se **ruší rozhodnutí 2026-10-22
   „třídění až po nahrávání“ a limit 500 médií na dávku** (limit vznikl kvůli JS frontě).
   Web a PC zůstávají u dnešního toku (nahrát, pak třídit). Třídicí obrazovky a logika jsou
   jeden kód, takže web to může dostat později.
2. **Hranice dne podle noci**, ne podle místní půlnoci. Datum dne zůstává štítkem
   (datum probuzení), takže se nemění klíč `day_notes`, mění se jen to, kam spadnou fotky
   po půlnoci.
3. **Spodní lišta mobilu: Domů · Třídění (odznak „k roztřídění“) · ＋ · Cesta**, s ikonami.
   Aktivita od čtenářů patří do Domů, Mapa je přepínač v Cestě, Zápis je krok („Další
   krok“, ＋, detail dne), ne záložka. Správa (Členové, Koš, Sdílení, Nastavení) zůstává
   v jedné nabídce (UX-15). Nahrazuje návrh lišty z vize 4e.
4. **Bez push notifikací** (ani lokálních večerních) a **bez počasí** (žádný Open-Meteo).
   Žádná nová závislost. Kanál novinek zůstává E-mail/Atom z D6. Fakta dne jen z dat,
   která máme (km, hodiny venku, kde den začal a skončil); východ a západ slunce se může
   spočítat offline z polohy a času.
5. Android ze specifikací se **nedělá** (rozhodnutí 2026-10-09).

##### Vlny práce

| Vlna | Obsah                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DB                                   | Poznámka                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| 1    | `pnpm algo:score`: metriky nad fixture z Kanady (přesnost přiřazení dne, F1 hranic etap ±1 den, falešný odpad, přesnost sloučení duplicit); za pravdu ruční a zamčené zastávky z produkce. Kontrola tónu v překladech (zakázané formulace typu „jsi pozadu“). Čtecí pozice „Pokračovat, kde jsi skončil“ a „Co je nového“ (jen lokálně). Sbalené dny bez textu do jedné řádky. Fronta „asi odpad“ z příznaků, které iOS plugin už vrací (`screenshot`, `burstId`), bez automatiky.                                    | ne                                   | Začít tady: bez skóre jsou všechny prahy odhad.                                     |
| 2    | V `packages/core`: dny podle noční mezery (22:00–07:00, mezera > 4 h, záloha 04:00, den 23/25 h při přechodu pásem); jistota 0–1 a kód důvodu u každého rozhodnutí (z odstupu od prahu, kalibrace podle přijatých a vrácených návrhů); výběr 3–6 nejlepších fotek dne (relevance minus podobnost, max. 2 na zastávku, pokrytí dne); typ dne (přesun, výlet, pobyt, město) pro otázky při psaní; návrh opravy hodin z dvojic fotek různých zařízení (jen návrh ke schválení); poloměr zastávky podle rychlosti pohybu. | ne                                   | Čisté, deterministické funkce s testy.                                              |
| 3    | **Posun hodin jako vlastnost zařízení**, ne přepis `captured_at` (jedno číslo, vrací se jedním klepnutím). **Záznam dávek automatiky** (id dávky u zastávek) pro hromadné „Vrátit“.                                                                                                                                                                                                                                                                                                                                   | ano: migrace, pgTAP, `pnpm db:types` | DB se dohodne před kódem (CLAUDE.md). Migraci navrhuje `db-specialist`.             |
| 4    | Mobilní tok metadata → náhledy → vybrané; úvodní „wow“ (sestavená cesta bez nahrání jediné fotky); stav fotky (nalezena, ponechána, nejlepší, nahrána). Obrazovka Dnes s odhadem času z vlastního tempa autora.                                                                                                                                                                                                                                                                                                       | ne                                   | Závisí na ověření výpočtu `phash` a ostrosti ve WKWebView (výkon, paměť) na iPhonu. |
| 5    | Čtenář: pruh „Právě jsme“ (D5), fáze etap pro dlouhé cesty, lepicí lišta „Pozdrav autorům / Sledovat novinky“ na mobilu, dlaždice „Všech N“, pohlednice dne (lehká statická stránka bez JS), režimy čtení „Rychle“ a „Příběh“, velikost písma.                                                                                                                                                                                                                                                                        | D5, D6 (už navrženo)                 | Mozaiku držet v pravidle poměrů stran z 5b (žádný nízký široký pruh).               |

##### Úpravy obrazovek podle vizuální revize

- **Třídění (web):** podobné snímky ukázat větší a vedle sebe s údajem o ostrosti, ne jako malé dlaždice.
- **Třídění (mobil):** „Pryč“ pojmenovat tak, aby bylo jasné, jestli jde o koš; nápovědu gest nedávat malým světlým písmem.
- **Návrhy etap:** „Přijmout vše nad 80 %“ je hlavní akce, ne drobný odkaz; štítek jistoty odlišit i barvou, ne jen slovem; u dlouhých seznamů nerozdělovat váhu mezi dvě stejná tlačítka na každé kartě.
- **Psaní dne (mobil):** „Nadiktovat jednu větu“ je hlavní tlačítko nad „Uložit den“.
- Kontrast malých popisků ověřit proti 4,5 : 1 při implementaci (zatím jen vizuální dojem, neměřeno).

##### Stav 4f-B (2026-10-29, cloudová session)

- **Sloučení s `main` (ZS-0 až ZS-7).** Větev 4f-B vznikla ze starého základu a mezitím `main` získala vlastní 4f („ZS“, výše) včetně produkční definice dne `v2_local_day` (SQL, hranice 04:00, pásmo podle převahy fotek). Rozhodnutí uživatele: **noc jako pravidlo**, implementované v `core`, nad modelem `main`. Provedeno: `photoDayZones` nese resolver noci a `pickDay` (nový, `local-day.ts`) jen mění hranici dne uvnitř výběru pásma z `main`; všechna místa, která brala `pickLocalDay` v UI (veřejný čtenář, osnova a přehled, hledání, plynutí, počet dnů v `public-journey.ts`), volají `pickDay`. Bez fotek v okolí noci platí 04:00. `organize.ts` a harness zůstávají na 04:00 (dny pro tvorbu zastávek); **rozdíl mezi nimi a zobrazením je známý a neověřený**. SQL (`pick_local_day` v `search_journey`, `get_public_journey`) je stále 04:00.
- **D3 přečíslováno** na `20261028120000_v2_moment_local_day.sql` (kolize čísla s `v2_moment_kind`), `journey_progress` bere `moments.local_day`, jinak `pick_local_day` z `main`. 🧪 **TESTED lokálně:** `supabase db reset` a `supabase test db` (39 souborů / 774 testů) zelené v Dockeru. `database.types.ts` je stále ručně upravený: CLI připnuté v CI (2.75.0) jde spustit jen s obrazem, který cloud nestáhne; s CLI 2.122 vyšly změny D3 shodně s ručními (ostatní rozdíly jsou šum verze CLI). **Do produkce neaplikováno** (viz níže).
- **Core (čisté, deterministické, testy):** `confidence.ts` (jistota z odstupu od prahu, pásma 0,85 / 0,50, kódy důvodu, fronta od nejméně jisté), jistota a kód u `createNightDayResolver` (DAY_BY_NIGHT_GAP / DAY_BY_FALLBACK_4AM), `classifyDayType` (přesun, výlet, pobyt, město), `suggestClockOffsets` (páry ≤120 s a ≤100 m, ≥5 párů, ≥80 %, medián >30 s; **jen návrh**, nic se neaplikuje). Poloměr zastávky podle rychlosti u `clusterMoments` se **nedělal**: `main` má `detectStops` s hustotou a poloměrem 150–300 m, `clusterMoments` je jen srovnání. Scorecard (`pnpm algo:score`) má scénáře funkcí (typ dne 5/5, posun hodin 5/5, automatické pásmo bez chyby 4/4), syntetické.
- **Revize proti auditním specifikacím (2026-10-28, 5 dokumentů) vůči sloučenému stavu**, hotové opravy: čtenář „Zavřít“ místo „Ukončit čtení“, „Místa“ sbalená, výzva „Napiš autorům pozdrav“, dlaždice „Všech N“ (mozaika, aspect-ratio pravidlo 5b zachováno), nepojmenovaná etapa se čte jako své místo (chyba 3), štítek „Plánovaná cesta“ se řídí fotkami (chyba 4), tón editoru (žádné „chybí zápis“, „jsi ještě neotevřel“; test tónu je rozšířen). Ověřeno `pnpm check` a e2e čtenáře (18 testů ve 1400 i 390 px, `pnpm test:e2e:public`, mockované API).
- **Otevřené po revizi (nic z toho není hotové):** karta „Další krok“ s odhadem času a přehled „Dnes“; „Přijmout vše nad 80 %“ (segment nemá uloženou jistotu); `pickBestOfDay` do Dne (potřebuje prohlížeč s reálnými daty, **nezapojeno**); lepicí lišta čtenáře „Sledovat novinky“ (není backend odběru); fáze etap pro dlouhé cesty; stav „Ještě před námi“; viditelnost, odložené zveřejnění a skrytí polohy (UI chybí, DB částečně); Wi‑Fi jako výchozí pro nahrávání (mění chování, čeká na souhlas); diktování v poznámce dne; gesto „nahoru = nejlepší“ místo koše; třídění před nahráváním v iOS (vlna 4) a vše, co potřebuje zařízení. Výchozí prahy algoritmu se od specifikace liší (hystereze základny, 25 km, 15 médií, 6 bitů duplicit, 3 h doplnění polohy); měnit až nad zlatou sadou.
- **Do produkce:** D3 se neaplikovala. Důvody: migrace byla přepsána po zjištění divergence, produkce má ZS-D1 až D4 a je potřeba schválení uživatele pro nové znění `journey_progress`; navíc UI zapisující `local_day` je nasazené až s touto větví.

##### Stav 4f (2026-10-29, původní lokální session)

- **Vlna 1:** hotovo a commitnuto (`algo:score`, test tónu, sbalené dny, čtecí pozice, fronta „asi odpad“). 🧪 TESTED, na zařízení a na skutečných datech **UNVERIFIED**.
- **`pickBestOfDay`:** hotovo v `core`, nezapojeno do UI.

##### Brána 4f

`pnpm algo:score` existuje a běží v CI jako report (cíle ze specifikace: přiřazení dne > 98 %, F1 hranic etap > 0,9, sloučení duplicit > 99,5 %, falešný odpad < 0,5 %, vrácené auto-akce < 5 %; všechno **UNVERIFIED**, než se změří); fotka pořízená po půlnoci spadne do správného dne a `day_notes` se nezmění; posun hodin a vrácení dávky mají pgTAP; mobilní tok ze 4. vlny ověřen na iPhonu (dávka ~300 fotek bez nahrání před tříděním) a ve ~390 px; `pnpm check` a `pnpm db:test` zelené; žádné `new Date()` jako čas zážitku.

#### Fáze 4f — Automatické zastávky a třídění (2026-10-26, 📝 PROPOSED)

Vychází z rozboru algoritmu a toku třídění (2026-10-26) a z diskuse nad ním. Uživatel
schválil všechna doporučení (rozhodnutí 10 v kap. 9). Navazuje na 4e (UX-30, UX-38)
a mění fázi 3 v bodě 1 (shlukování do momentů). Nic není implementováno.

##### Zjištění

- **Shlukování selhává ve 14 z 24 syntetických scénářů** (jen `clusterMoments`, stage
  a trip vrstva nespuštěna). Pěší zastávky se slévají (procházka městem: 1 moment
  místo 8), z jízd vznikají jednofotkové „zastávky“ (180 km autem: 8 momentů),
  řídký výběr fotek se zhroutí do jednoho momentu, osamělá fotka zmizí ve vzdáleném
  sousedovi, dva telefony 20 km od sebe dají 40 jednofotkových momentů. Příčiny
  (`moments.ts`): pevné prahy 15 min / 3 km od těžiště, slučování skupin < 3 fotky do
  sousedů až 6 h / 5 km bez stropu, žádný filtr odlehlých GPS, žádné proudy podle
  autora, fotky bez GPS jen časem do 30 min.
- **Vrstva dnů** (`days.ts`, `stages.ts`, `trips.ts`, `journey-plan.ts`) zná jen celé
  dny. Výlet nebo přesun uvnitř dne nevzniká, i když ho `segments` (`starts_at`,
  `ends_at`, `trip_type`) unesou bez migrace.
- **Rychlost mezi fotkami** rozliší chůzi, kolo a auto jen při krátkých mezerách.
  Při dlouhé mezeře (auto s fotkou po 2 h, kolona) je potřeba víc signálů a míra jistoty.
- **Tok:** „Uspořádat automaticky“ je ruční tlačítko, nic ho nespouští. Rychlé třídění
  bez existujících zastávek nabízí u každé fotky „Nová zastávka“. Titulek
  „Zastávka 15:07“ je náhradní popisek (`placeNames = null`). Fotky z doplňku se
  nekontrolují proti existujícím ručním zastávkám.
- **Třídění na webu** (`QuickSortView.tsx`): fotka přetéká pod lištu (grid bez pevné
  výšky řádku), zoom schová porovnávanou fotku, na dotyku chybí Porovnat a Zoom,
  „Zoom 100 %“ bere variantu `large`, partner porovnání je náhodný, akce platí jen pro
  hlavní fotku, seznam „Změnit“ nepoužívá bohatý `MoveToSheet`, barvy jsou natvrdo
  ve třech pohledech, ★ nikde nevysvětluje, k čemu slouží.
- **Reálná pravda už v repu je:** `packages/core/src/automation/fixtures/canada-v1.ts`
  (9 dní reálné cesty, anonymizované souřadnice, ruční seskupení z v1 v `v1Entry`).
  Celá Kanada (`locked`/`manual` zastávky v produkci) se čte jen přes orchestrátora.

##### Principy

1. Stroj navrhne, člověk potvrdí. Každé rozhodnutí algoritmu nese **důvod**
   („rozděleno: 2,4 km autem“), stejně jako etapy ve `stages.ts`.
2. Žádná fotka se neztratí. Koš je obnovitelný, nejistota se řeší viditelně.
3. Ptáme se jen tam, kde to má dopad. Práce se řadí podle jistoty.
4. UI nemluví nepravdu: žádné „Zastávka 15:07“ a žádný interval u jedné fotky („kolem 15:07“).
5. Měříme, nehádáme. Metrikou je práce uživatele, ne abstraktní index.
6. Hloubka hierarchie odpovídá velikosti cesty. Prázdná úroveň se neukazuje.

##### Algoritmus „Pobyt – pohyb – výlet“

Čisté deterministické funkce v `packages/core/src/automation`, bez platformních závislostí.

1. **Příprava.** Proudy podle autora (`owner_id`) a zařízení (nový sloupec, ZS-D3).
   Filtr odlehlých GPS (daleko od mediánu sousedů ±30 min nebo nemožná rychlost →
   bod ztratí polohu, ne čas). Doplnění polohy fotkám bez GPS ze stejného proudu nebo
   interpolací. Podezřelý posun hodin foťáku (celé hodiny proti proudu s GPS) se
   **navrhne** k opravě přes `shift_media_time` (D2), nikdy se neopraví potichu.
   Video počítá s trváním, Live Photo nevytváří druhý bod.
2. **Pobyty.** Prostorově časové shluky s adaptivním poloměrem (výchozí 150–300 m).
   Časový práh je **plynulý**: k × medián mezer v klouzavém okně dané osoby, s dolní
   a horní mezí. Pevný přepínač „řídký den“ se nepoužívá. Dopoledne husté
   a odpoledne řídké se zpracují správně. V řídkém úseku je každá fotka záměrný důkaz
   přítomnosti a nic se nesráží: zastávky vznikají z prostorové blízkosti (~400 m)
   a osamělá fotka je platná zastávka typu `point`.
3. **Mezery mezi pobyty.** Klasifikuje se úsek, ne pár fotek: vzdálenost, čas,
   rychlost, nadmořská výška, druh místa, sousední úseky. Výsledek: chůze, kolo,
   vozidlo, nebo neznámý přesun, s jistotou. Když pravidla nestačí, přichází v úvahu
   malý HMM (Viterbi), pořád deterministický.
4. **Cestou.** Fotky z jízdy (vozidlo kolem) tvoří sbalenou zastávku typu `en_route`
   u přesunu. Zastávkou `stay`/`point` se stanou jen u známého místa (atrakce, vrchol,
   město do 150 m), při zpomalení, při ≥ 3 fotkách v ~300 m nebo ≥ 10 min, nebo
   v řídkém výběru (bod 2). Povýšení z „Cestou“ je jedno ťuknutí.
5. **Výlet uvnitř dne.** Pěšky nebo na kole ≥ 90 min a ≥ 3 km (příroda nebo smyčka)
   = segment `trip` (`trek`/`day`) s rozhledy jako zastávkami. Městská procházka nad
   prahem je výlet `walk` (nový `trip_type`, ZS-D2) se zastávkami jako body, pod
   prahem samostatné zastávky. Vícedenní výlety dál řeší `trips.ts` (večery mimo
   základnu) a obě vrstvy používají stejné typy.
6. **Souběh osob.** Více autorů současně na různých místech → **paralelní zastávky**
   podle osoby. Blízké proudy (stovky metrů) se spojí. **Výlety a etapy zůstávají
   společné**, protože členství v úsecích se určuje časem (kap. 4.1). Výlet jen jedné
   osoby je fáze 6.
7. **Příjem do stávajícího.** Nová fotka se zařadí do existující zastávky, pokud do ní
   patří časem i polohou. Potvrzenou zastávku jde **jen rozšířit**, a to v časovém
   okně u jejího okraje (výchozí ±2 h) a nikdy přes hranici dne. Zbytek vytvoří nové
   zastávky. Stabilní ID (kotva = nejstarší fotka).
8. **Zámek.** Každý vědomý zásah (přesun fotky, přejmenování, sloučení, rozdělení,
   potvrzení) zastávku zamkne (`locked`) a automatika na ni už nesáhne.
9. **Názvy.** Automatika **neukládá `title`**, jen `place_id`. UI název odvodí: konkrétní
   místo (vrchol, jezero, atrakce) → čtvrť a město → „u města“ → denní doba
   („čtvrtek odpoledne“). Stejné názvy v jednom dni se rozliší („Banff · ráno“). Před
   dorazením se ukáže skeleton „Hledám místo…“. Uložený `title` = ruční název a zámek
   (v souladu s rozhodnutím 8: názvy z míst jsou jen návrh).
10. **Geokódování** běží už při uspořádání: cache po mřížce, dávky, pořadí podle
    viditelnosti (nejdřív aktuální den). Ověřit denní limit Geoapify na volném tarifu.

Tvar dne (město, celodenní výlet, výlet + zastávky, přesunový den, pobytový den, řídký
den) se odvozuje, neukládá se. Interní typy (`stay`, `point`, `en_route`) uživatel
nevidí, jen ikonu (špendlík, bota, auto) a čas („kolem 15:07“).

##### UX: hloubka podle velikosti cesty

| Rozsah cesty             | Co uživatel vidí                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| výlet na jeden den       | zastávky (bez dnů a etap)                                                                     |
| víkend, týdenní dovolená | dny → zastávky, výlety a přesuny jako karty ve dni, základna („bydleli jsme v…“) z `trips.ts` |
| delší trip (2–6 týdnů)   | dny, etapy jako návrh                                                                         |
| velká cesta (měsíce)     | etapy → dny → zastávky, třídění a postup po etapách                                           |

Etapa se nabídne až při ≥ 2 navržených etapách s jasným důvodem, jinak úroveň neexistuje.
Odvozeno, bez DB.

##### UX: tok

**Nahrání → automatické uspořádání → Příjem → třídění po dnech → konec dne (UX-38).**

1. **Auto-uspořádání po nahrání** běží samo (zařazení do existujících, nové zastávky,
   výlety, přesuny, názvy, série, návrhy do koše). Nové zastávky mají štítek „nová“.
   **Vrátit uspořádání** vrací jen strukturu nezamčených zastávek, nikdy koš, ★
   a ruční zásahy.
2. **Příjem** ukazuje **jen nově přišlé dny** (na cestě večer z telefonu, doma
   hromadně). Práci řadí podle jistoty: „32 zastávek vypadá jistě, 8 potřebuje oko“.
3. **Třídění po dnech, jedna smyčka** (spojuje kontrolu zastávek a třídění fotek):
   nahoře pás zastávek dne (obálka, název, počet), pod ním fotky aktuální zastávky
   s akcemi **Koš · Nechat · ★ Nejlepší**, tah nahoru = koš, Undo, automatický posun.
   Rozdělit = „řez před touto fotkou“, sloučit = přetažení na souseda nebo „sloučit
   s předchozí“. Dotřídění zastávky ji potvrdí (zámek). Dny s vysokou jistotou mají
   hromadné **„Den sedí“**. Karta „Nevím kam“ pro nezařazené.
4. **Potvrzení struktury ≠ fotky roztříděné.** „Den sedí“ nebo potvrzení zastávky
   neoznačí fotky jako vyřízené (`reviewed_at`). Fotka je roztříděná až po projití.
   Pak platí „co není v koši, zůstává“. Návrhy do koše (rozmazané, duplicity, balast)
   jsou označené a zesvětlené s důvodem, ne smazané.
5. **Porovnání a zoom** (jedna komponenta pro třídění i sérii): vedle sebe na šířku,
   nad sebou na výšku, pevné řádky `minmax(0,1fr)`, popisek pod každou fotkou. Partner
   je nejbližší ze stejné série, nikdy z koše, s výběrem `[` `]`, a `Tab` fotky prohodí.
   Akce pro A i B. Synchronní zoom na bod (dvojklik nebo dvojťuk, pinch, Ctrl+kolečko,
   tažení, `Z`), úrovně Celé → 100 % → 200 % s dotažením největší varianty a skutečným
   měřítkem v popisku. Ovladače i na dotyku.
6. **Jeden list „Přesunout do“:** `MoveToSheet` všude (obálky, počty, čas, návrh nahoře,
   seskupení po dnech, „Nová zastávka“ s názvem místa). `batchMoveTargets` a vlastní
   overlay se odstraní.
7. **Vizuál:** oprava layoutu fotky, pastelové tokeny `--color-action-keep/trash/star`
   pro všechny tři pohledy (WCAG AA), vysvětlení ★ (tooltip, nápověda zkratek, toast po
   prvním označení, filtr ★). Nová slova („Cestou“, „Přesun“) projdou slovníkem UX-02.

##### DB kontrakt (aditivní, DB první)

| #     | Obsah                                                                                                                                                                                                                                                                     | Proč                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| ZS-D1 | `moments.kind text` (`stay`/`point`/`en_route`, default `stay`), check constraint, granty jako u ostatních sloupců `moments`                                                                                                                                              | „Cestou“, body, UI a počty |
| ZS-D2 | `trip_type` rozšířit o `walk`                                                                                                                                                                                                                                             | městská procházka          |
| ZS-D3 | `media.device text` (normalizovaný EXIF Make + Model, nullable), plnění při importu (web i iOS)                                                                                                                                                                           | proudy, posun hodin        |
| ZS-D4 | **Hranice dne ve 4:00 místního času**, pásmo dne = pásmo převahy fotek toho dne (jinak `home_tz`). Jedna definice v SQL (sdílená funkce pro `journey_progress`, `day_notes`, veřejné RPC) i v `core` (`summarizeZonedDays`), pgTAP včetně přejezdu pásem a datové hranice | dny bez zdvojení a děr     |

Bez migrace: výlet a přesun uvnitř dne (`segments`, ověřit RLS a pgTAP), zámek (`locked`,
`origin`), jistota (odvozená, v UI jen pro řazení práce).

##### Měření

- **Harness (ZS-0):** 24 scénářů jako fixtures (doplnit video a Live Photo) a vlastnosti:
  nezávislost na pořadí vstupu, idempotence, přidání vzdálených fotek nezmění zamčenou
  zastávku, stabilní ID, zóny a DST, přejezd datové hranice.
- **Reálná pravda:** `canada-v1.ts` hned. Celá Kanada jen s `locked`/`manual`
  zastávkami, neupravené automatické nejsou pravda.
- **Metriky:** **počet úprav k pravdě** (rozdělení a sloučení na 100 fotek, odpovídá
  bráně „Kanada do 30 minut“) a **B-cubed F1** po fotkách. Randův index se nepoužívá.

| Metrika (výchozí cíle, doladit po ZS-0) | Cíl             |
| --------------------------------------- | --------------- |
| Úpravy k pravdě                         | ≤ 3 / 100 fotek |
| B-cubed F1 zastávek (Kanada)            | ≥ 0,85          |
| Média ve správném výletu (brána fáze 3) | ≥ 90 %          |
| Jednofotkové zastávky z jízd            | ≤ 5 %           |
| Selhání z 24 scénářů                    | 0               |
| Výkon, 5 000 fotek (bez geokódování)    | < 2 s           |
| Determinismus a idempotence             | 100 %           |

##### Úkoly (stav všech: 📝 PROPOSED)

| ID   | Úkol                                                                                                                                                                            | Role | Závisí na   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------- |
| ZS-0 | Harness: 24 scénářů, vlastnosti, `canada-v1.ts`, metriky, baseline dnešního algoritmu                                                                                           | app  | —           |
| ZS-1 | DB kontrakt ZS-D1 až D4, pgTAP, `db:types`                                                                                                                                      | db   | —           |
| ZS-2 | Rychlé opravy třídění: layout fotky, porovnání a zoom, `MoveToSheet` všude, pastelové tokeny, vysvětlení ★, `placeNames` se skeletonem, `suggestStop` respektuje zařazení fotky | app  | —           |
| ZS-3 | Příprava a robustnost: proudy, odlehlé body, doplnění polohy, návrh posunu hodin, plynulá hustota, body                                                                         | app  | ZS-0, ZS-1  |
| ZS-4 | Pobyty, klasifikace mezer, „Cestou“, výlet uvnitř dne (`walk`/`trek`/`day`), souběh osob, důvody                                                                                | app  | ZS-3        |
| ZS-5 | Příjem do stávajícího, okno rozšíření, zámek při zásahu, názvy bez `title`, geokódování při uspořádání                                                                          | app  | ZS-4        |
| ZS-6 | Hloubka hierarchie podle velikosti cesty                                                                                                                                        | app  | ZS-4        |
| ZS-7 | Tok: auto-uspořádání po nahrání, Vrátit uspořádání, Příjem nových dnů podle jistoty, třídění po dnech, „Den sedí“, Nevím kam                                                    | app  | ZS-5, UX-30 |
| ZS-8 | Ladění na reálných datech, iPhone (paměť dvou velkých fotek ve WKWebView), EXIF `GPSSpeed` a čas v GPX (UNVERIFIED)                                                             | app  | ZS-7        |

Pořadí: ZS-0, ZS-1 a ZS-2 souběžně (nezávislé). Pak ZS-3 → ZS-4 → ZS-5, ZS-6 → ZS-7 → ZS-8.
Před ZS-7 krátké schválení tvaru obrazovek (mockupy).

**Brány:** ZS-3: scénáře řídkého výběru, odlehlých bodů, posunu hodin a dvou telefonů
v zelených, nic se nezhoršilo. ZS-4: procházka, túra, jízda, kolo, vlak a smíšený den
v zelených, výlet a přesun uvnitř dne v `segments`. ZS-7: celý tok na reálných datech,
koš, Undo a Vrátit uspořádání ověřené. ZS-8: cíle z tabulky metrik, iPhone i web.
Vždy `pnpm check` a `pnpm db:test` zelené.

Rizika: průjezd × zastávka u jediné fotky je z dat nerozhodnutelný (proto jistota
a „Cestou“ s povýšením). Reálná GPS jsou hlučnější než scénáře, prahy jsou jen
výchozí. Geokódování stovek zastávek trvá minuty (cache, pořadí podle viditelnosti).
Změna hranice dne se dotkne DB, klienta i veřejných stránek najednou.

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

### Fáze 5b — Atlas čtenáře (redesign veřejných stránek) — 🧪 TESTED (kroky 1–7; brána čeká na Lighthouse a ruční kontrolu na skutečných datech, viz v2-status.md)

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
10. **Automatické zastávky a třídění (2026-10-26):** uspořádání běží samo po nahrání,
    hranice dne ve 4:00 místního času (pásmo dne = pásmo převahy fotek). Osamělá fotka
    při jízdě jde do „Cestou“, zastávkou je jen u známého místa nebo v řídkém výběru.
    Kontrola zastávek a třídění fotek jsou jedna smyčka po dnech s hromadným „Den sedí“.
    Potvrzení struktury neoznačí fotky jako roztříděné. Souběh osob jen u zastávek,
    výlety a etapy společné. `moments.kind`, `trip_type` `walk` a `media.device` jako
    aditivní migrace. Metriky: úpravy k pravdě a B-cubed F1. Hloubka hierarchie podle
    velikosti cesty. Podrobnosti kap. 5, Fáze 4f.
