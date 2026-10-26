# Plán: automatické zastávky a třídění fotek

**Stav:** PROPOSED (návrh ke schválení, nic není implementováno)
**Datum:** 2026-10-26
**Rozsah:** algoritmus seskupování (`packages/core/src/automation`), tok „nahrání → zastávky → třídění“ a související UI/UX ve webové aplikaci i iOS (Capacitor)
**Navazuje na:** `docs/plan-v2.md` (UX-30, UX-38, fáze 4e). Do `plan-v2.md` ani `v2-status.md` se zatím nezapisuje, to až po schválení.

Štítky u tvrzení: **VERIFIED** = ověřeno v kódu nebo spuštěným experimentem, **UNVERIFIED** = hypotéza ke změření, **PROPOSED** = návrh.

---

## 0. Shrnutí

1. Dnešní seskupování **selhává ve 14 z 24 testovaných scénářů** (kap. 2.3). Pěší zastávky se slévají, jízdy tvoří jednofotkové „zastávky“, řídký výběr fotek se zhroutí do jednoho momentu, sdílená cesta se rozpadne na desítky jednofotkových zastávek.
2. Algoritmus nezná pohyb (pěšky, kolo, auto) a nezná strukturu uvnitř dne (výlet, přesun, zastávky). Vrstva etap a výletů pracuje jen s celými dny.
3. Návrh: nový algoritmus **pobyt – pohyb – výlet**, odolný proti šumu, vícero autorům a řídkým výběrům fotek. Výsledek nese jistotu a UI se ptá jen tam, kde to má dopad.
4. Tok se obrátí: **automatika vytvoří zastávky hned po nahrání** (včetně názvů), uživatel je **potvrzuje po zastávkách** a uvnitř zastávky **třídí fotky** (Koš / Nechat / ★). Třídění se neztrácí, naopak se stává hlavní činností.
5. Přidává se opravené porovnání dvou fotek se zoomem, jeden list „Přesunout do“, názvy míst místo „Zastávka 15:07“, pastelové barvy a vysvětlení ★.
6. Práce je rozdělená do 5 fází s měřitelnými bránami. Bez harnessu a měření „dobré zastávky“ poznat nejde, proto začíná fixtures a metrikami.

---

## 1. Rozhodnutí uživatele a stav

| # | Rozhodnutí | Stav |
|---|---|---|
| R1 | Automatické uspořádání se spustí hned po nahrání, zastávky musí být dobré a s dobrými názvy | schváleno |
| R2 | Třídění fotek se nesmí ztratit, uživatel si nechá jen fotky, které chce | schváleno |
| R3 | Hranice dne ve **4:00 místního času** (lidé jsou vzhůru po půlnoci) | schváleno, vyžaduje DB práci (kap. 3.8) |
| R4 | Výstup algoritmu se porovná s uživatelovými **ručními zastávkami v Kanadě** (jen čtení) | schváleno, **blokováno**: Supabase konektor čeká na přihlášení v claude.ai (z této session to nejde) |
| R5 | Algoritmus musí zvládnout i **výběr fotek** (zastávka s jedinou fotkou) | zohledněno v návrhu (kap. 3.3) |
| R6 | Mockupy zatím ne, nejdřív flow a algoritmy | platí, schválení tvaru obrazovek před fází 4 |
| R7 | Nic nového do `docs/`, plán je samostatná stránka | platí |

---

## 2. Zjištění

### 2.1 Rychlé třídění na webu (UI)

Všechny body jsou **VERIFIED** čtením `src/features/media-batch/ui/QuickSortView.tsx`, dopad v běžící aplikaci jsem nespouštěl.

| # | Zjištění | Místo v kódu |
|---|---|---|
| 1 | **Fotka se nevejde.** Kontejner je `grid items-center` s automatickou výškou řádku, takže `max-h-full` na `<img>` nemá k čemu se vztáhnout a fotka přeteče pod spodní lištu. | `:684-747` |
| 2 | **Titulek „Zastávka 15:07“ není název.** Je to náhradní popisek (`workspace.untitledMoment`), protože `momentTitle` dostává `placeNames = null`. Geocoder název nikdy nedodá. | `:196-209`, `moment-labels.ts` |
| 3 | **Zelené tlačítko a blok „Návrh zastávky“ říkají totéž** a věta „Fotka vznikla během téhle zastávky“ je jen interní důvod z `suggestStop`. Návrh ignoruje, že fotka v zastávce už je (`item.momentId`). | `:760-790`, `:865-874` |
| 4 | **Seznam „Změnit“ je holý a chronologický od začátku cesty,** bez názvů, obálek a počtů, bez posunu na návrh. Bohatý `MoveToSheet` (obálka, počet, čas, návrh) existuje, ale tu se nepoužívá. | `move-targets.ts`, `MoveToSheet.tsx` |
| 5 | **Nová zastávka vzniká po jedné fotce.** „Nová zastávka“ volá `create_moment_from_media` pro aktuální fotku, bez titulku a bez místa. Doplnění místa běží až později na pozadí (~2 s na zastávku). | `use-batch-actions.ts`, `use-resolve-missing-places.ts` |
| 6 | **★ „Nejlepší“** je jen příznak `media.starred`, do „roztříděno“ se nepočítá. Používá se pro obálku dne a zastávky, mozaiku, mapu a veřejný příběh, ale uživatel to nikde nevidí a přehled ★ nemá vlastní místo. | `day-stops.ts`, `workspace-overview.ts`, `workspace-map.ts`, `journey-model.ts` |
| 7 | **Barvy jsou natvrdo** (`bg-red-600`, `bg-emerald-700`, `bg-amber-400`) ve třech pohledech, bez sdílených tokenů. | `QuickSortView.tsx`, `SeriesView.tsx`, `CullView.tsx` |

**Porovnání a zoom** (VERIFIED):

| # | Zjištění | Místo |
|---|---|---|
| C1 | **Zoom schová porovnávanou fotku:** `partner === undefined \|\| zoom ? null : <Stage …/>`. Obě tlačítka přitom svítí zapnutě. | `:728` |
| C2 | **Na dotyku tlačítka Porovnat a Zoom neexistují** (blok `hidden … lg:block`). | `:792` |
| C3 | **„Zoom 100 %“ není 100 %:** obrázek dostane jen `max-w-none`, takže se ukáže ve svých pixelech. Prohlížeč bere variantu `large`, `photo-variants.ts` má pro zoom preferenci `full` (max 2560 px), kterou nikdo nepoužívá. | `media-thumb.ts`, `photo-variants.ts` |
| C4 | Zoom začíná v levém horním rohu, jen scrollbary, žádný pinch ani zoom na bod, zůstává zapnutý u další fotky. | `Stage` |
| C5 | Partner je náhodný: první nezpracovaná fotka ze série, jinak předchozí z dávky. Může být v koši nebo z jiného dne, bez popisku, nejde vybrat. | `:601-606` |
| C6 | Koš, ★ a Nechat platí jen pro hlavní fotku, nejde „tuhle nechat, druhou do koše“. | `QuickSortView.tsx` |
| C7 | Zoom není synchronizovaný mezi fotkami a `SeriesView` zoom nemá vůbec. | `SeriesView.tsx` |
| C8 | Test kontroluje jen `aria-pressed`, ne že jsou vidět dvě fotky. | `QuickSortView.test.tsx:564` |

### 2.2 Tok dnes

1. Fotky se nahrají a čekají s `reviewed_at = null` (`BatchPage`).
2. Automatické rozdělení je **ruční tlačítko** „Uspořádat automaticky“ (`OrganizeJourneyButton`), nic ho nespouští samo a uživatel neví, že ho má pustit.
3. Rychlé třídění bere fotky po jedné. Návrh zastávky porovnává čas a GPS jen s **už existujícími** zastávkami. Bez nich je tlačítko pro každou fotku „Nová zastávka“.
4. Fotky z doplňku se nezařadí do existujících zastávek: `planMoments` vynechá z shlukování jen fotky, které už v chráněné zastávce jsou. Nové fotky se shluknou do nových zastávek bez kontroly překryvu s ručními (**VERIFIED čtením, ověřit testem**).
5. Název zastávky vzniká až po vytvoření a v `v2-status.md` stojí, že názvy přeskupených automatických zastávek se neřeší.

### 2.3 Algoritmus: výsledky na 24 scénářích (VERIFIED, syntetická data)

Skripty: `scen.mjs`, `scen2.mjs`, `scen3.mjs` (jen `clusterMoments`, stage a trip vrstvu jsem nespouštěl). V repu zatím nejsou, stanou se fixtures ve fázi F0.

| ID | Scénář | Očekáváno | Dnes | |
|---|---|---|---|---|
| A | Procházka městem, 8 památek po 400 m, 6 fotek/památka | 8 zastávek | **1 moment** (55 fotek, 106 min) | ✗ |
| B | Túra 6 h, 10 km, foto / 12 min | 1 výlet | 2 momenty, řez uprostřed svahu | ✗ |
| C | Jízda 180 km, okénko / 20 min + 2 vyhlídky | 2 zastávky + přesun | **8 momentů**, 6 jednofotkových | ✗ |
| D | Jedna špatná GPS (25 km) uvnitř 20fotkové zastávky | 1 | 3 | ✗ |
| E | Telefon s GPS + foťák bez GPS prokládaně | 1 | 1 | ✓ |
| F | Oběd, 2 h pauza, stejné místo | 1 | 1 | ✓ |
| G | Kolo 25 km, foto / 10 min | 1 jízda | 3 „zastávky“ po 7,5 km | ✗ |
| H | Vlak 180 km + příjezd | cesta + 1 | 5 (4 jednofotkové) | ✗ |
| I | Den: město (3), auto, túra smyčka 4 h, auto, večeře | 3 + výlet + 1 | město slité do 1, 2 jednofotkové z jízd, túra slitá s parkovištěm | ✗ |
| J | Řídký den (1 foto / 45 min, 3 km) | 3–5 zastávek | **1 moment** 8 h / 4 km | ✗ |
| K | Bez GPS, 2 h díra | 2 | 2 | ✓ |
| L | Procházka ulicí, 2 fotky / 30 min | 1 nebo pár | 3 | ✓ (přijatelné) |
| M | Roadtrip, 2fotkové zastávky po 70 km | 6 | 6 | ✓ |
| N | Telefon + foťák bez GPS, hodiny foťáku −3 h | 1 | 2, druhý bez polohy | ✗ |
| O | Foťák bez GPS 40 min po telefonu, stejné místo | 1 | 2 | ✗ |
| P | Dva telefony 20 km od sebe, střídavě po 3 min | 2 paralelní zastávky | **40 jednofotkových** | ✗ |
| Q | Dva telefony 600 m od sebe | 1 | 1 | ✓ |
| R | Večírek 23:30–00:40 | 1 večer | 1 | ✓ |
| S | Promenáda 5 km, foto / 4 min | 1 procházka | 1 | ✓ |
| T | Muzeum, 50 min mezera uvnitř | 1 | 1 | ✓ |
| U | Výběr: 8 jednotlivých fotek po ~1 km | 8 zastávek | **1 moment** | ✗ |
| V | Výběr: 6 jednotlivých fotek po 25 km | 6 | 6 (shodou okolností) | ✓ |
| W | Výběr: 3 fotky / osamělá fotka o 5 km / 4 fotky | 3 zastávky | 2, osamělá **zmizela** | ✗ |
| X | Zastávka (3) / fotka z okénka 90 km/h / zastávka (3) | 2 + průjezd | 3 (okénko jako zastávka) | ✗ |

**Příčiny** (`packages/core/src/automation/moments.ts`):

- Fotka se připojí do 15 min a do 3 km od těžiště. Chůze mezi památkami se proto slije (A) a pohyb nikdy neodliší stání.
- Slučování malých skupin (< 3 fotky) pohlcuje do libovolně velkých sousedů do 6 h a 5 km, bez stropu. Řídký den se zhroutí (J, U). Osamělá fotka zmizí (W).
- Vzdálené jednofotkové skupiny se neslučují a zůstanou samy (C, H, P, X).
- Žádný filtr odlehlých bodů (D).
- Žádné proudy podle autora ani zařízení (P). Fotky bez GPS se připojují jen časem do 30 min (N, O).
- Pevný časový práh nezávislý na frekvenci focení.

**Vrstva dnů** (`days.ts`, `stages.ts`, `trips.ts`, `journey-plan.ts`) pracuje jen na úrovni celých dnů (těžiště, první a poslední bod). Neexistuje struktura uvnitř dne (výlet + zastávky, přesun). Úspěch: `segments` mají `starts_at`/`ends_at` a `trip_type` je enum `trek | day | transfer | stay`, takže výlet nebo přesun uvnitř dne **jde uložit bez migrace** (ověřit RLS a pgTAP).

### 2.4 Pěšky, nebo autem? (rychlost mezi fotkami, VERIFIED na idealizovaných datech)

Třídy: dwell < 0,8 km/h, pěšky < 7, kolo < 25, vozidlo ≥ 25.

| Případ | Výsledek |
|---|---|
| Městská chůze, túra, kolo, jízda 90 km/h | správně |
| 20 km autem s fotkou až po 2 h (10 km/h) | vypadá jako kolo, **špatně** |
| 4 km autem v koloně za 20 min (12 km/h) | vypadá jako kolo, **špatně** |

Závěr: rychlost je spolehlivá, jen když jsou po sobě jdoucí fotky blízko v čase. Při dlouhé mezeře musí rozhodovat další signály s mírou jistoty (druh místa, nadmořská výška, vzdálenost bez fotky, okolní úseky). Při nízké jistotě jen „Přesun“, doladí se při kontrole.

Neověřeno: že iPhone zapisuje do EXIF rychlost (`GPSSpeed`), a zda ji čteme (nejspíš ne). Parser GPX zahazuje čas bodů.

### 2.5 Jiné aplikace

| Aplikace | Co si z toho vzít | Zdroj |
|---|---|---|
| Apple Photos | Hierarchie Moment → Kolekce → Rok z času a místa, bez GPS hůř | nápověda, recenze (přesný algoritmus nezveřejněn) |
| Google Photos | Alba se navrhují, nevznikají potichu | články z roku 2016 (dnešní pojmenování neověřeno) |
| Polarsteps | Fotky se do kroků **nenahrávají automaticky**, kroky se navrhují z GPS trasování | oficiální nápověda |
| Aftershoot, Narrative Select | Stack podobných s navrženým vítězem, který jde změnit | blogy výrobců (marketingové) |
| Lightroom | Nejdřív vyřadit, pak vybírat, auto-advance, Survey a Compare | Adobe nápověda |
| Slidebox | Tah nahoru = koš s obnovou, Undo, ťuknutí na album | články |

Literatura (rychlý průzkum, ne přehled): stay-point detekce (typicky 200 m / 20 min v aplikačních článcích, jiný kontext než řídké fotky), události fotek přes časové mezery doplněné GPS (Cooper 2005, jen ze sekundárního zdroje).

---

## 3. Cílový návrh

### 3.1 Principy

1. Stroj navrhne, člověk potvrdí.
2. Žádná fotka se neztratí. Koš je obnovitelný a nejistota se řeší zastávkou, ne skrytím.
3. Ptáme se jen tam, kde to má dopad.
4. UI nemluví nepravdu: žádné „Zastávka 15:07“ jako titulek a žádný interval u zastávky s jednou fotkou.
5. Měříme, nehádáme.

### 3.2 Cílový tok

**Nahrání → automatické uspořádání → Příjem → kontrola po zastávkách → třídění fotek → konec dne (zápis).**

1. Po nahrání běží uspořádání samo: fotky se zařadí do existujících zastávek (nová jen pro zbytek), vznikají výlety a přesuny, doplňují se názvy (skeleton „Hledám místo…“), detekují se série, duplicity a balast.
2. **Příjem** shrne: „200 fotek → 12 zastávek, 3 dny. 9 návrhů do koše, 4 nezařazené.“ Jedno tlačítko **Projít zastávky** a malé **Vrátit uspořádání**.
3. **Kontrola po zastávkách** (jednotkou je zastávka, ne fotka): Sedí / Rozdělit / Sloučit / Přejmenovat. Karta „Nevím kam“ pro nezařazené.
4. **Třídění fotek** uvnitř zastávky (Koš · Nechat · ★).
5. **Konec dne:** souhrn a nabídka zápisu (už existuje v UX-38).

### 3.3 Algoritmus „Pobyt – pohyb – výlet“

Čisté, deterministické funkce v `packages/core`, bez platformních závislostí.

1. **Příprava.** Řazení po autorovi a zařízení. Filtr odlehlých GPS (bod daleko od mediánu sousedů ±30 min nebo nemožná rychlost se vyřadí z polohy, ale zůstane v čase). Doplnění polohy fotkám bez GPS (stejný autor a čas, nebo interpolace mezi sousedy). Podezřelý posun hodin foťáku (celé hodiny) se **navrhne** k opravě a nikdy se neopraví potichu.
2. **Pohybové stavy** mezi po sobě jdoucími fotkami: dwell / pěšky / kolo / vozidlo / rychlé, s hysterezí a mírou jistoty. Další signály: druh místa (příroda), `altitude`, vzdálenost bez fotky, okolní úseky, případně čas v GPX a EXIF rychlost (UNVERIFIED).
3. **Pobyty (zastávky).** Shluk v okruhu ~150–300 m, trvající ≥ 5 min nebo s ≥ 3 fotkami. Chůze mezi pobyty je odděluje (A, I). Časové prahy se odvozují od frekvence focení dané osoby.
4. **Přesuny.** Úseky vozidlem. Fotky z okénka se přiřadí k úseku jako sbalená skupina **„Cestou“** a samy zastávkou nejsou. Zastávkou se stanou při ≥ 3 fotkách v ~300 m nebo ≥ 10 min (C, H).
5. **Výlet uvnitř dne.** ≥ 90 min a ≥ 3 km pěšky nebo na kole, příroda nebo smyčka, navazuje na přesun. Vznikne jeden segment `trip` (trek nebo day) s rozhledy jako podzastávkami, bez řezů uprostřed svahu (B, G).
6. **Souběh a sdílení.** Při více autorech vznikají **paralelní zastávky** podle osoby (P). Blízké proudy se spojí (Q).
7. **Příjem do stávajícího (F4).** Nová fotka se zařadí do existující zastávky, pokud do ní časem a polohou patří. Potvrzená zastávka se jen **rozšíří**, nikdy se nepřeskupuje. Zbytek se shluknutím vytvoří nové zastávky. Stabilní ID zastávek (kotva = nejstarší fotka).

**Jednofotkové zastávky a výběr fotek (R5).**

Scénáře V a X mají v datech stejný tvar (jedna fotka, kolem vozidlo), takže z dat jen se nerozliší. Návrh proto počítá s nejistotou:

- **Režim hustoty.** Frekvenci focení měříme po dnech (medián mezer). Řídký den (> ~20 min mezi fotkami) považujeme za výběr: každá fotka je záměrný důkaz přítomnosti a nic se nesráží. Zastávky vznikají z prostorové blízkosti (~400 m) v rámci dne, osamělá fotka je platná zastávka typu **„bod“** (U, W, J).
- **Skóre důkazů průjezd × zastávka.** Rychlosti obou sousedních úseků, čas od sousedů, poloha na známém místě (geocoder: atrakce, vrchol, město do 150 m), nadmořská výška. **Při nejistotě vyhrává zastávka**, aby se fotka nikdy neschovala (X).
- **Žádná falešná přesnost.** Zastávka dostane `confidence` a příznak „délka neznámá“. UI ukáže „kolem 15:07“, ne interval.
- **Ptáme se jen s dopadem.** Například osamělá fotka mezi dvěma jízdami bez známého místa: „Zastavil ses tu?“ (ano / byl to jen průjezd).

### 3.4 Názvy zastávek

Pořadí: název od uživatele → konkrétní místo (vrchol, jezero, atrakce) → město a čtvrť → „u města“ → denní doba („Čtvrtek odpoledne“). **Nikdy „Zastávka 15:07“.** Stejné názvy v jednom dni se rozliší („Banff · ráno“). Před dorazením názvu je vidět skeleton a krátký text „Hledám místo…“. Názvy nových zastávek se doplňují už při uspořádání, ne až později, a výsledek se cachuje po mřížce (`place_lookups`). Přejmenování zastávku zamkne (`origin` manual).

### 3.5 Tvar dne (odvozený, neukládá se)

| Tvar | Znaky | Jak se ukáže |
|---|---|---|
| Město | N pobytů, chůze mezi nimi | seznam zastávek |
| Celodenní výlet | výlet ≥ 60 % času nebo fotek | jedna karta výletu s podzastávkami |
| Výlet + zastávky | výlet a pobyty před nebo po něm | výlet + zastávky |
| Přesunový den | převaha přesunů, „Cestou“ | přesun + 0–2 zastávky |
| Pobytový den | 1–2 dlouhé pobyty (pláž, hotel) | 1–2 zastávky |
| Řídký den | nízká hustota, nízká jistota | zastávky typu „bod“ |

### 3.6 UX balíky

| # | Balík | Obsah |
|---|---|---|
| **U1** | Auto-uspořádání po nahrání | Běží samo. Nové zastávky mají štítek „nová“. „Vrátit uspořádání“ jedním klikem (využívá `deleteAutoMoments`). |
| **U2** | Příjem | Souhrn po nahrání, jedno tlačítko Projít zastávky, počty návrhů a nezařazených, „Co dál“ (UX-10/11). |
| **U3** | Kontrola po zastávkách | Karta: obálka, název (skeleton), čas nebo „kolem“, počet, typ (pobyt / výlet / přesun). Sedí / Rozdělit / Sloučit / Přejmenovat. „Sedí“ zamkne zastávku a označí fotky jako roztříděné. Karta „Nevím kam“. |
| **U4** | Třídění fotek | Hlavní činnost. Tlačítka **Koš · Nechat · ★ Nejlepší**, čip zastávky nahoře (změna jedním ťuknutím), tah nahoru = koš, Undo, automatický posun. Série s doporučeným vítězem. Návrhy do koše (rozmazané, duplicity, balast) jsou označené a zesvětlené s důvodem, ne smazané. Po potvrzení zastávky platí „co není v koši, zůstává“ (výchozí, viz kap. 7). „Vyřízeno“ a blok „Návrh zastávky“ mizí. |
| **U5** | Porovnání a zoom | Jedna komponenta pro třídění i sérii. Vedle sebe (na šířku) nebo nad sebou (na výšku), pevné řádky `minmax(0,1fr)`. Popisek pod každou fotkou (čas, zastávka, ostrost, ★). Partner: nejbližší ze stejné série, nikdy z koše, výběr `[` `]` a ◀ ▶, `Tab` prohodí. Akce pro A i B („Nechat tuhle, druhou do koše“). Zoom platí pro obě fotky a je **synchronní** (stejný relativní bod, společný posun): dvojklik nebo dvojťuk na bod, pinch, Ctrl+kolečko, tažení, `Z`. `Esc` vypne zoom, druhý `Esc` porovnání. Úrovně Celé → 100 % → 200 %. Při vstupu do zoomu se dotáhne největší dostupná varianta a popisek ukáže skutečné měřítko. Ovladače i na dotyku. |
| **U6** | Jeden list „Přesunout do“ | Stávající `MoveToSheet` místo vlastního seznamu: obálky, počty, čas, návrh nahoře, seskupení po dnech s hlavičkou, otevření na návrhu, „Nová zastávka“ nahoře s názvem místa. `batchMoveTargets` a vlastní overlay mizí. |
| **U7** | Vizuál a vysvětlení | Oprava layoutu fotky (grid). Pastelové tokeny `--color-action-keep/trash/star` pro všechny tři pohledy (koš ~`rose-300/25` s `rose-100`, nechat ~`emerald-300/25`, ★ ~`amber-200/25`), kontrast ověřit na WCAG AA. Vysvětlení ★: tooltip, řádek v panelu zkratek, toast po prvním označení, odkaz na filtr ★ a v souhrnu třídění. |

### 3.7 Hranice dne ve 4:00

Den začíná ve 4:00 místního času fotky (zóna z GPS). Událost v 0:40 patří večeru předchozího dne. Dotýká se `summarizeZonedDays`, `day_notes`, `journey_progress` a veřejných stránek. Musí být **jednotná konstanta** v klientovi i v DB (RPC), jinak se rozejdou počty dnů. Proto samostatný úkol s migrací a pgTAP (DB první).

### 3.8 Datový model

- Výlet a přesun uvnitř dne: `segments` (kind `trip`, `trip_type` trek/day/transfer, `starts_at`/`ends_at`) **bez migrace** (ověřit RLS a pgTAP).
- Potvrzení zastávky: stačí `locked` a `origin` (existují).
- Hranice dne 4:00: migrace RPC a pgTAP.
- Typ zastávky (pobyt / chůze / přesun) a `confidence`: odvozovat; samostatný sloupec jen pokud odvození nestačí. Rozhodne `db-specialist` ve fázi 3.

---

## 4. Měření

**Harness (F0).** 24 scénářů jako fixtures s očekáním plus vlastnosti: nezávislost na pořadí vstupu, idempotence, přidání vzdálených fotek nezmění potvrzenou zastávku, stabilní ID, správné zóny a DST.

**Reálná pravda.** Uživatelovy ručně upravené (manual/locked) zastávky v cestě Kanada. Porovnání výstupu algoritmu s nimi: Rand index, počet řezů a slití, tvar dne. Čtení jen přes orchestrátora (R4).

**Počáteční cíle** (k odsouhlasení):

| Metrika | Cíl |
|---|---|
| Jednofotkových momentů z jízd | ≤ 5 % |
| Shoda s ručními zastávkami (Kanada) | ≥ 85 % |
| Žádný z 24 scénářů v červených číslech | 0 selhání |
| Výkon, 5 000 fotek | < 2 s |
| Determinismus a idempotence | 100 % |

---

## 5. Fáze, pořadí a brány

| Fáze | Obsah | Brána |
|---|---|---|
| **1** | **F0** harness (24 scénářů, metriky, baseline) ∥ rychlé UX: U6, U7, oprava zoomu a layoutu, `placeNames` se skeletonem, `suggestStop` respektuje zařazení fotky | Baseline čísla. Layout a zoom ověřené screenshoty. |
| **2** | **F1** robustnost a režim hustoty + DB (4:00) | U, W, X, P, D, N, O, J v zelených, žádný scénář se nezhoršil. |
| **3** | **F2** pobyt–pohyb + **F3** struktura dne | A, B, C, G, H, I v zelených. Výlet a přesun uvnitř dne v `segments`. |
| **4** | **F4** příjem do stávajícího + U1–U5 | Celý tok prochází na reálných datech, koš a Undo ověřené. |
| **5** | **F5** ladění, zařízení, volitelné signály | Shoda s Kanadou ≥ 85 %, výkon, iPhone i web ověřeny. |

**Pořadí:** fáze 1 → 2 → 3 → 4 → 5. Fáze 1 jde souběžně (harness a rychlé UX nejsou závislé). **Před fází 4** krátké schválení tvaru obrazovek (mockupy), až budeš chtít.

Velikosti: F0 S, F1 M, F2 L, F3 L, F4 M, F5 M, UX balíky U1–U7 dohromady L.

---

## 6. Rizika a omezení

- Průjezd × zastávka u jediné fotky je z dat nerozhodnutelný. Proto `confidence` a výchozí „zastávka“.
- Reálná GPS jsou hlučnější než moje scénáře. Prahy (150–300 m, 90 min, 3 km, 20 min) jsou jen výchozí a ladí se na datech.
- Geocoder dává ~2 s na zastávku (`REFACTOR_PLAN.md`), stovky zastávek znamenají minuty. Mitigace: cache po mřížce, skeleton, doplňování na pozadí.
- Změna dne na 4:00 se dotkne DB, klienta i veřejných stránek najednou.
- Chybná klasifikace hustoty (řídký × normální) může zhoršit výsledek. Mitigace: prahy z mediánu mezer osoby, ne pevné, a ladění na reálných datech.
- Rozbor je syntetický, `stages`/`trips` jsem nespouštěl a hotová čísla z reálné cesty zatím nemám (R4 blokováno).
- Neověřeno: EXIF rychlost z iPhonu, dostupnost většího než `large` pro skutečné 100 % (kap. 2.1 C3), paměť dvou velkých fotek ve WKWebView.

---

## 7. Otevřené otázky

| # | Otázka | Doporučení |
|---|---|---|
| Q1 | **Fotky z okénka při přesunu:** sbalená skupina „Cestou“ u přesunu, nebo je nezobrazovat jako zastávky vůbec? (týká se jen nejisté pozice, výběr fotek viz kap. 3.3) | sbalená skupina „Cestou“, nic se neskryje |
| Q2 | **Výchozí stav po potvrzení zastávky:** „co není v koši, zůstává“ (rychlé), nebo každá fotka vědomě ponechaná (pomalejší, přesně „jen to, co chci“) | co není v koši, zůstává, s označenými návrhy do koše |
| Q3 | Paralelní zastávky podle osoby ve sdílených cestách | ano |
| Q4 | Odsouhlasit počáteční cíle z kap. 4 | ano jako výchozí, doladit po F0 |
| Q5 | Autorizace Supabase konektoru pro R4 | uživatel ve svých claude.ai konektorech |

---

## 8. Proces (podle `CLAUDE.md`)

- Orchestrace přes skill `refactor-task`, agenti `db-specialist`, `app-specialist`, `reviewer`. Zdroj pravdy o průběhu `REFACTOR_PLAN.md`, výsledky fází do `docs/v2-status.md`.
- **DB první:** kontrakt se dohodne a zmigruje dřív, než na něj web nebo iOS sáhne. Jeden agent na soubor, migraci nebo sdílený typ.
- `reviewer` po RLS, migracích a změnách edge funkcí.
- Před každým commitem `pnpm check`. Commity, pushe, vzdálené migrace a změny produkce **jen po souhlasu uživatele**.
- Produkční data jen čtením a přes orchestrátora.
- Po schválení se rozhodnutí a fáze zapíšou do `docs/plan-v2.md` (kap. 9) a `docs/v2-status.md`, nic nového do `docs/`.

---

## 9. Příloha

**Použité místo v kódu:** `src/features/media-batch/ui/QuickSortView.tsx`, `SeriesView.tsx`, `MoveToSheet.tsx`, `model/move-targets.ts`, `model/move-sheet.ts`, `api/use-batch-actions.ts`, `src/features/journey-workspace/api/use-resolve-missing-places.ts`, `lib/moment-labels.ts`, `lib/media-thumb.ts`, `packages/core/src/automation/{moments,organize,suggest-stop,days,stages,trips,journey-plan,names,tracks}.ts`, `packages/utils/src/photo-variants.ts`, `supabase/functions/resolve-place`, `supabase/migrations/20261009120000_v2_core_schema.sql`.

**Zdroje:**
[Polarsteps: přidání fotek](https://polarsteps.helpscoutdocs.com/article/72-how-do-i-add-photos),
[Polarsteps: návrhy kroků](https://support.polarsteps.com/hc/articles/24267949061906),
[Apple Photos: Moments a Collections](https://help.apple.com/photos/mac/1.0/en.lproj/pht56eafa987.html),
[Google Photos, navrhovaná alba (2016)](https://techcrunch.com/2016/03/22/google-photos-gets-smarter-automatically-creates-albums-with-your-best-photos),
[Aftershoot vs Narrative](https://narrative.so/blog/aftershoot-vs-narrative-which-is-better-culling-software),
[Adobe: Lightroom Compare a Survey](https://helpx.adobe.com/si/lightroom/help/browse-compare-photos.html),
[Slidebox](https://techcrunch.com/2016/04/11/slidebox-brings-its-tinder-like-photo-management-app-to-android),
[Stay-point detekce (arXiv)](https://arxiv.org/pdf/1904.09357),
[trackintel: staypoints](https://trackintel.readthedocs.io/en/stable/modules/preprocessing.html),
[Image clustering (patent US8818113)](https://patents.google.com/patent/US8818113).
