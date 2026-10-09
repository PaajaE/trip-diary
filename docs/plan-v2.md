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

1. **Shlukování do momentů:** mezera v čase (výchozí 90 min) nebo ve vzdálenosti
   (výchozí 1,5 km), parametry laditelné. Výstupem je stabilní ID odvozené z prvního
   média, aby se momenty při novém výpočtu „nepřeházely“.
2. **Návrh výletů:** odchylka od „základny“ (místo, kde se opakovaně spí) a návrat;
   vícedenní pobyt mimo silnice znamená trek. Návrh obsahuje důvod („6 dní, 42 km od
   základny“).
3. **Návrh předělů etap:** velké přesuny (vzdálenost za den) a změny základny.
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
