# Reactive Testing

> **HISTORICKÝ DOKUMENT — ZMRAZENO, NEMĚNIT.**
> Toto je historický záznam původní vize. Neodráží aktuální architekturu: sekce "Interceptor/Chain of Responsibility" a "Tech Stack" popisují inline validaci (validation chain běžící při každém kroku scénáře), kterou epiky nahradily dvoufázovým modelem — capture leg (orchestrator + collectory, žádné asserty, FR-4) a offline validace (pure funkce nad corpus, FR-5). Terminologie "aspect" je též mrtvá — nahrazena "shared validator" (NFR-4).
>
> Živý SSOT: `_bmad-output/specs/spec-reactive-testing/SPEC.md` · `_bmad-output/planning-artifacts/prds/prd-reactive-testing-2026-08-15/prd.md` · `_bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md` · `_bmad-output/planning-artifacts/epics/epics.md`.
>
> Přežívající hodnota (harvest): motivace, state-reuse value, role mapping — viz PRD.

## Vize

Aplikuji Reactive Testing v TypeScriptu s pomocí Playwright MCP serveru jako nástroje pro párové programování nad živým prohlížečem. Cílem je POC za 1–2 týdny → funkční demo.

Spec-driven: typový systém TypeScriptu slouží jako specifikace — interface = kontrakt, typy = dokumentace.

## Motivace: Kraken Pro

Tento projekt je primárně zaměřen na testování aplikace **Kraken Pro** — profesionální trading platformy. Je to můj hlavní Proof of Work pro pozici **Snr QA Automation Engineer - Pro** (Czechia, remote).

Širší kontext hledání práce: [[file:~/org/h1_horizon/hledam-praci-2026.org][Hledám práci 2026 — kompletní analýza nabídek a strategie]]

Kraken Pro je ideální cíl pro Reactive Testing:
- **Komplexní UI s mnoha stavy** — order book, charty, portfolio, historie, nastavení
- **Stavový charakter** — každý dialog/screen má definovaný stav, vstupy a přechody
- **Vysoká cena chyby** — chyba v UI trading platformy = reálné finanční ztráty
- **Playwright v požadavcích** — Kraken hledá někoho, kdo rozumí Playwrightu na architektonické úrovni

## Hlavní hodnota: State Reuse (konkrétní úspora času)

Klasicky: každý test si sám naviguje do stavu, který potřebuje validovat. AI generuje N separátních testů → každý platí cenu navigace (3–5 s).

Reactive testing: **jedna navigace, N validací:**

```
naviguj do order booku (jednou, ~3 s)
  ├─ aspect: spread valid?
  ├─ aspect: depth visible?
  ├─ aspect: prices current?
  ├─ aspect: balance positive?
  └─ aspect: no unexpected notification?
```

Pro 20 aspektů přes 10 stavů UI: 60 s vs. 30 s navigace.

**V AI-assisted vývoji:** AI generuje HODNĚ testů → state reuse chrání před duplicitní navigací.

## Dvoufázový model: Pozorování vs. Validace

| Fáze 1: Scénář (běží prohlížeč)          | Fáze 2: Validace (běží proti snapshotům)   |
|-------------------------------------------|---------------------------------------------|
| krok → snapshot, jen SBÍRÁ data           | snapshot → aspect-1, aspect-2...            |
| žádné asserty                             | čisté pure functions                        |
| prohlížeč může být zavřený po sběru       | prohlížeč není potřeba                      |

- Validace jsou pure fce (snapshot → result) — testovatelné izolovaně
- Snapshoty jsou serializovatelné — validace offline / zpětně
- Nová validace → spustí se proti historickým snapshotům
- Playwright accessibility snapshot jako vstup

## Model-Based Testing: Aplikace jako stavový automat

### Koncept

Kraken Pro není "sbírka stránek". Je to **stavový automat** — konečná množina stavů (obrazovek, dialogů) a definovaných přechodů mezi nimi.

Místo abych testy vymýšlel ad-hoc ("co kdybych teď kliknul támhle?"), popíšu aplikaci formálně:

```
Stav = obrazovka/dialog v konkrétním stavu
Přechod = akce, která mění stav (klik, formulář, API response)
Podmínka (guard) = co musí platit, aby přechod proběhl
```

Z tohoto modelu pak **generuji testovací scénáře** systematicky — pokrytí všech stavů, přechodů, i specifických cest.

### Dialog = Kontrakt

Každý dialog/obrazovka v Kraken Pro je **kontrakt**:

- **Vstupní podmínky** — v jakém stavu musí aplikace být, aby dialog fungoval? (např. "uživatel je přihlášený", "existuje otevřená pozice")
- **Akce** — co uživatel dělá? (vyplní formulář, klikne na tlačítko)
- **Výstupní stav** — co se změnilo? (nová obrazovka, notifikace, změna dat)
- **Invarianty** — co MUSÍ platit vždy? (balance ≥ 0, spread > 0, žádná chyba v konzoli)

Tohle není "dokumentace". Je to **spustitelná specifikace** — TypeScript interface, který je zároveň kontraktem i typovou kontrolou.

### TypeScript reprezentace stavového automatu

```typescript
// --- Kontrakt dialogu ---
interface DialogContract<TOutput> {
  /** Co musí platit před vstupem do dialogu */
  preconditions: string[];
  /** Akce, která se v dialogu provede */
  action: (page: Page) => Promise<TOutput>;
  /** Co musí platit po provedení akce */
  postconditions: string[];
  /** Invarianty — musí platit vždy, bez ohledu na stav dialogu */
  invariants: string[];
}

// --- Stav aplikace ---
interface AppState {
  id: string;
  name: string;           // např. "OrderBook:BTC/USD"
  url?: string;
  /** Kontrakty dostupné z tohoto stavu */
  contracts: Record<string, DialogContract<unknown>>;
}

// --- Přechod mezi stavy ---
interface Transition {
  from: string;           // ID výchozího stavu
  to: string;             // ID cílového stavu
  trigger: string;        // název kontraktu, který přechod spouští
  guard?: string[];       // podmínky, za kterých je přechod možný
}

// --- Model aplikace ---
interface AppModel {
  name: string;
  states: Record<string, AppState>;
  transitions: Transition[];
  initialState: string;
}
```

### Příklad: Kraken Pro — Order Flow

```typescript
const krakenProModel: AppModel = {
  name: "Kraken Pro — Order Flow",
  initialState: "dashboard",

  states: {
    dashboard: {
      id: "dashboard",
      name: "Dashboard",
      contracts: {
        selectBtcUsd: {
          preconditions: ["user is authenticated"],
          action: (page) => page.click('[data-market="BTC/USD"]'),
          postconditions: ["order book is visible", "chart is visible"],
          invariants: ["balance is displayed", "no console errors"],
        },
      },
    },

    orderBook: {
      id: "orderBook",
      name: "OrderBook:BTC/USD",
      contracts: {
        placeLimitBuy: {
          preconditions: ["order form is visible"],
          action: (page) =>
            fillOrderForm(page, { side: "buy", type: "limit", price: 65000, amount: 0.1 }),
          postconditions: ["order confirmation toast shown"],
          invariants: ["balance reserved ≥ order value", "spread > 0", "order appears in open orders"],
        },
        placeMarketBuy: {
          preconditions: ["order form is visible"],
          action: (page) =>
            fillOrderForm(page, { side: "buy", type: "market", amount: 0.1 }),
          postconditions: ["order executed immediately", "balance decremented"],
          invariants: ["balance ≥ 0"],
        },
        navigateToPortfolio: {
          preconditions: [],
          action: (page) => page.click(".nav-portfolio"),
          postconditions: ["portfolio page visible"],
          invariants: [],
        },
        cancel: {
          preconditions: [],
          action: (page) => page.click(".btn-cancel"),
          postconditions: ["returned to dashboard"],
          invariants: [],
        },
      },
    },

    portfolio: {
      id: "portfolio",
      name: "Portfolio",
      contracts: {
        navigateToOrderBook: {
          preconditions: ["has open positions or recently traded pair"],
          action: (page) => page.click('[data-market]'),
          postconditions: ["order book visible for selected pair"],
          invariants: ["P&L is displayed", "balance total is consistent"],
        },
      },
    },
  },

  transitions: [
    { from: "dashboard",       to: "orderBook", trigger: "selectBtcUsd" },
    { from: "orderBook",       to: "orderBook", trigger: "placeLimitBuy",
      guard: ["balance ≥ order value"] },
    { from: "orderBook",       to: "orderBook", trigger: "placeMarketBuy",
      guard: ["balance ≥ order value"] },
    { from: "orderBook",       to: "portfolio", trigger: "navigateToPortfolio" },
    { from: "orderBook",       to: "dashboard", trigger: "cancel" },
    { from: "portfolio",       to: "orderBook", trigger: "navigateToOrderBook" },
  ],
};
```

### Ze stavového automatu ke scénářům

Mít model je jedna věc. **Generovat z něj testovací scénáře** je druhá:

```typescript
interface Scenario {
  name: string;
  steps: ScenarioStep[];
}

interface ScenarioStep {
  stateId: string;
  contractName: string;
}

// --- Generátory ---

/** Všechny přechody jako jednotlivé scénáře (pokrytí přechodů) */
function generateTransitionCoverage(model: AppModel): Scenario[] {
  return model.transitions.map((t, i) => ({
    name: `[T${i}] ${t.from} → ${t.to} via ${t.trigger}`,
    steps: [
      { stateId: t.from, contractName: t.trigger },
    ],
  }));
}

/** Všechny cesty délky N z počátečního stavu (pokrytí cest) */
function generatePathCoverage(model: AppModel, maxDepth: number): Scenario[] {
  // BFS/DFS procházení stavového prostoru
  const scenarios: Scenario[] = [];
  const queue: { path: ScenarioStep[]; currentState: string }[] = [
    { path: [], currentState: model.initialState },
  ];

  while (queue.length > 0) {
    const { path, currentState } = queue.shift()!;
    if (path.length >= maxDepth) continue;

    const state = model.states[currentState];
    for (const [contractName, _contract] of Object.entries(state.contracts)) {
      const transition = model.transitions.find(
        (t) => t.from === currentState && t.trigger === contractName
      );
      if (!transition) continue;

      const newPath = [...path, { stateId: currentState, contractName }];
      scenarios.push({
        name: `Path: ${newPath.map((s) => s.contractName).join(" → ")}`,
        steps: newPath,
      });

      queue.push({ path: newPath, currentState: transition.to });
    }
  }

  return scenarios;
}

/** Happy path — definovaná člověkem (nejdůležitější flow) */
const happyPath: Scenario = {
  name: "Happy Path: Dashboard → Order Book → Place Limit Buy → Portfolio",
  steps: [
    { stateId: "dashboard",  contractName: "selectBtcUsd" },
    { stateId: "orderBook",  contractName: "placeLimitBuy" },
    { stateId: "orderBook",  contractName: "navigateToPortfolio" },
  ],
};
```

### Propojení s Reactive Testing architekturou

Tohle je ten klíčový moment — **stavový automat a Reactive Testing nejsou dva oddělené koncepty. Jsou to dvě vrstvy nad sebou:**

```
┌──────────────────────────────────────────────────────────────┐
│ MODEL-BASED TESTING (FSM)                                    │
│                                                              │
│ AppModel → generátory → scénáře                              │
│   ├─ Transition coverage  (každá hrana alespoň jednou)       │
│   ├─ Path coverage        (cesty délky N z počátečního stavu)│
│   ├─ Happy path           (definováno člověkem)              │
│   └─ Negative paths       (guard violations, error stavy)    │
│                                                              │
│ ČLOVĚK definuje MODEL (stavy, přechody, kontrakty)           │
│ STROJ generuje SCÉNÁŘE                                       │
└──────────────────────────┬───────────────────────────────────┘
                           │ Scénáře (sekvence kroků)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ REACTIVE TESTING (Interceptor Chain)                         │
│                                                              │
│ Scénář → Orchestrátor/CDP → snapshoty → validační interceptory│
│                                                              │
│ Každý krok scénáře:                                          │
│   1. Proveď kontrakt.action(page)                            │
│   2. Seber accessibility snapshot                            │
│   3. Spusť validation chain                                  │
│      ├─ Kontraktové invarianty (vždy)                        │
│      ├─ Postconditions (po úspěšné akci)                     │
│      └─ Doménové aspekty (order book, balance, notifikace)   │
│                                                              │
│ STROJ provádí navigaci a sbírá snapshoty                     │
│ AI generuje validační kód                                    │
└──────────────────────────────────────────────────────────────┘
```

**Role člověka a stroje:**

| Co                         | Kdo         | Výstup                              |
|----------------------------+-------------+--------------------------------------|
| Popis stavového automatu   | Člověk      | AppModel (stavy, přechody, kontrakty)|
| Generování scénářů         | Stroj       | Seznam Scenario (pokrytí přechodů/cest) |
| Provedení scénáře          | Stroj       | Sekvence snapshotů                  |
| Čtení snapshotů            | AI (goose)  | Návrhy validačních aspektů          |
| Schválení validační logiky | Člověk      | "Ano, TOHLE je správné chování"     |
| Generování validačního kódu| AI          | TypeScript validační funkce         |
| Běh validací               | Stroj       | Pass/fail report                    |

### Hodnota tohoto přístupu pro Kraken QA pozici

1. **Systematičnost místo ad-hoc** — "Jak víš, že testy pokrývají všechno?" → "Generuju je z formálního modelu aplikace"
2. **Udržitelnost** — změna UI = změna kontraktu (jedno místo), ne přepisování desítek testů
3. **Dokumentace = kód** — AppModel JE dokumentace architektury UI. Nový člen týmu čte model.
4. **Měřitelné pokrytí** — "Pokryl jsem 100 % přechodů" znamená něco konkrétního
5. **Stejný model, různé strategie** — transition coverage pro smoke testy, path coverage pro regresi, happy path pro critical flows

## Architektura: Interceptor/Chain of Responsibility Pattern

Inspirace z Pedestalu (Clojure HTTP framework), implementováno jako TypeScript chain:

- **Interceptor** = `{ name, enter(ctx), leave?(ctx), error?(ctx, err) }`
- **Context** protéká řetězcem interceptorů — každý může kontext obohatit, zkrátit řetězec, nebo vyvolat chybu
- Typový systém definuje kontrakt: `interface Interceptor<TContext>`, `interface ValidationResult`

```
Playwright scénář → krok → změna stavu UI → [validační interceptory] → agregovaný výsledek
                                            ├─ aspect-1 (order-book)
                                            ├─ aspect-2 (balance)
                                            ├─ aspect-3 (notifications)
                                            └─ ...
```

- `enter` = validace spuštěná PŘI změně stavu
- `leave` = volitelný úklid / teardown
- `error` = co při selhání — zalogovat, screenshot, pokračovat?
- Context = stav UI + výsledky validací — prochází všemi aspekty

### Příklad: TypeScript

```typescript
// Definice aspektu (validací) jako interceptory
interface Interceptor<T extends UIContext> {
  name: string;
  enter: (ctx: T) => T;
  leave?: (ctx: T) => T;
  error?: (ctx: T, err: Error) => T;
}

// Definice výsledku validace
interface ValidationResult {
  passed: boolean;
  detail: Record<string, unknown>;
  screenshot?: Buffer;
  error?: string;
}

// Konkrétní aspekty
const orderBookAspect: Interceptor<TradingContext> = {
  name: "validate-order-book",
  enter: (ctx) => ({
    ...ctx,
    results: {
      ...ctx.results,
      orderBook: {
        spreadValid: validSpread(ctx.uiState),
        depthVisible: isVisible(ctx.uiState, ".order-book-depth"),
        priceCurrent: withinThreshold(ctx.uiState, 0.5),
      },
    },
  }),
  error: (ctx, err) => ({
    ...ctx,
    results: {
      ...ctx.results,
      orderBook: { error: err.message, screenshot: takeScreenshot(ctx) },
    },
  }),
};

const balanceAspect: Interceptor<TradingContext> = {
  name: "validate-balance",
  enter: (ctx) => ({
    ...ctx,
    results: {
      ...ctx.results,
      balance: {
        updated: balanceChanged(ctx.uiState),
        positive: balancePositive(ctx.uiState),
      },
    },
  }),
};

// Řetězec aspektů — pořadí je konfigurovatelné
const validationChain: Interceptor<TradingContext>[] = [
  orderBookAspect,
  balanceAspect,
  notificationAspect,
  chartAspect,
  accessibilityAspect,
];

// Core loop
function reactToStateChange(uiState: PageState): UIContext {
  return validationChain.reduce(
    (ctx, interceptor) => {
      try {
        return interceptor.enter(ctx);
      } catch (err) {
        return interceptor.error?.(ctx, err as Error) ?? ctx;
      }
    },
    { uiState, results: {} } as UIContext
  );
}
```

### Playwright scénář + Reactive validace

```typescript
// KROK 1: Trader otevře BTC/USD order book
const stepOpenOrderBook: ScenarioStep = {
  action: (page: Page) => page.click(".nav-trading"),
  expect: "order-book-visible",
};

// Execute → UI state změní → validation chain se spustí
await executeScenario(page, stepOpenOrderBook);
// → enter orderBookAspect → spread valid? depth visible?
// → enter balanceAspect → balance still positive?

// KROK 2: Trader zadá limit buy order
const stepPlaceLimitOrder: ScenarioStep = {
  action: (page: Page) =>
    fillOrderForm(page, { pair: "BTC/USD", side: "buy", price: 65000, amount: 0.1 }),
  expect: "order-form-submitted",
};

await executeScenario(page, stepPlaceLimitOrder);
// → enter orderBookAspect → order appears in book?
// → enter balanceAspect → balance decremented correctly?
// → enter notificationAspect → confirmation toast visible?
```

**Proč lepší než klasický test:**
- Klasicky: test = simulace + validace v jednom (tight coupling)
- Reactive: simulace = "core flow", validace = "aspekty" kolem (loose coupling)
- Změna UI → měníš jen aspect, ne celou simulační cestu
- Nový požadavek → přidáš aspect, nemodifikuješ existující testy
- **Spec-driven**: TypeScript interface definuje kontrakt — AI generuje implementaci, typová kontrola ověřuje správnost

## Snapshot-Driven Validation Generation

**"Spec by example" naruby:**

| Klasicky                             | Tady                                        |
|--------------------------------------|---------------------------------------------|
| člověk → příklad → test              | stroj → snapshoty → AI → test → člověk schválí |

1. Člověk definuje SCÉNÁŘ
2. Stroj sbírá SNAPSHOTY
3. AI generuje VALIDAČNÍ SKRIPT (selektory z reálných dat)
4. Člověk SCHVALUJE (definuje intent: "ano, TOHLE je správné chování")

Člověk dvakrát v procesu — na začátku (scénář) a na konci (schválení). Mezitím běží stroje.

## Workflow: AI jako Pair Programmer (MCP)

1. Spustím testovací scénář přes CDP (orchestrátor)
2. Zastavím ve správném stavu — prohlížeč běží, stránka je v požadovaném stavu
3. Připojím goose (AI + Playwright MCP) k běžícímu CDP
4. Diskutuji s goose: "Vidíš tenhle order book? Co všechno bychom měli validovat?"
5. Goose přes MCP čte accessibility snapshot živé stránky
6. Vygeneruje TypeScript validační kód založený na REÁLNÝCH selektorech
7. Zkontroluji typy (`tsc --noEmit`), zvaliduji proti interface kontraktu
8. Přidám validaci do interceptor chainu
9. Runtime testu: čistý TypeScript, žádné MCP, deterministické, rychlé

| Fáze                     | Co běží          | Proč                               |
|--------------------------+------------------+-------------------------------------|
| Navigace do stavu        | Orchestrator/CDP | Deterministické, rychlé            |
| Explorace + generování   | goose + MCP      | Inteligence, porozumění kontextu   |
| Typová kontrola          | `tsc`            | Ověření kontraktu — spec-driven    |
| Runtime testu            | Čistý TypeScript | Deterministické, rychlé, spolehlivé |

## Tech Stack

- **TypeScript** — spec-driven: typy = kontrakt, interface = dokumentace architektury
- **Playwright** — browser automation, nativní TypeScript API (žádný bridge, žádný interop)
- **CDP** (Chrome DevTools Protocol) — low-level přístup k prohlížeči
- **MCP** (Model Context Protocol) — goose jako pair programmer, NE runtime
- **Interceptor/Chain of Responsibility pattern** — osvědčený návrhový vzor, typově bezpečný

## Proč TypeScript

### Spec-Driven Development — typy jako architektonický nástroj

Typový systém TypeScriptu není jen "safety net". Je to **specifikace**.

```typescript
// Interface = kontrakt. Tohle je specifikace architektury.
interface Interceptor<T extends UIContext> {
  name: string;
  enter: (ctx: T) => T;
  leave?: (ctx: T) => T;
  error?: (ctx: T, err: Error) => T;
}

interface ScenarioStep {
  action: (page: Page) => Promise<void>;
  expect: string;
}

type ValidationChain<T> = Interceptor<T>[];
```

- **Typy dokumentují architekturu** — nový člověk v týmu čte interface, ne dokumentaci
- **AI generuje do kontraktu** — goose vygeneruje implementaci, `tsc` ověří, že sedí
- **Refactoring s jistotou** — změna interface → compiler najde všechna místa k opravě
- **Stejný princip jako Clojure Spec, ale s compile-time garancí**

### Playwright = nativní TypeScript

Playwright je psaný v TypeScriptu. Jeho API je navržené pro TypeScript:

- Žádný bridge, žádný interop, žádná kompilace do JS z jiného jazyka
- Autocomplete v IDE = Playwright API rovnou k dispozici
- Typy pro `Page`, `Locator`, `BrowserContext` — není co mapovat
- Generované testy jdou rovnou spustit — `npx playwright test`

### Týmová kompatibilita

- TypeScript/Playwright je standardní stack QA týmů
- Není potřeba nikoho učit nový jazyk
- Code review známým způsobem — pull request, typová kontrola, lint
- CI/CD integrace přímočará — `tsc && playwright test`

### Původní POC v ClojureScriptu — proč ten přechod?

První iterace architektury vznikla v ClojureScriptu — REPL a immutable data struktury pomohly rychle prozkoumat návrhový prostor. Architektura (interceptor chain, dvoufázový model, state reuse) se ukázala jako správná.

Přechod na TypeScript je **validace architektury**: když principy fungují stejně dobře v jiném jazyce, jsou opravdu jazykově agnostické. A pro produkční nasazení dává TypeScript větší smysl — týmová kompatibilita, nativní Playwright API, spec-driven typový systém.

## Klíčové poznatky z diskusí

### 2026-08-10

1. **State reuse** jako hlavní hodnota (ne AOP — ten termín je zavádějící a kontroverzní)
2. **Dvoufázový model**: Pozorování ≠ Validace — striktní oddělení sběru a vyhodnocení
3. **Snapshot-driven generation**: stroj sbírá → AI generuje → člověk schvaluje
4. **Jazyk je implementační detail** — hodnota je v architektuře
5. Prezentační narativ: "state reuse", "dvoufázový model", "snapshot-driven validation" — NEPOUŽÍVAT "AOP"

### 2026-08-12 — Přechod na TypeScript + Model-Based Testing

1. **Přechod CLJS → TypeScript** — spec-driven: typy = specifikace, interface = kontrakt
2. **TypeScript je přirozený jazyk Playwrightu** — nativní API, žádný bridge
3. **Architektura zůstává identická** — interceptor chain, dvoufázový model, state reuse
4. **Přechod z CLJS → TS je důkaz jazykové nezávislosti** — principy jsou důležitější než syntax
5. **Produkční ready out of the box** — `npx playwright test` bez kompilace

### 2026-08-12 — Model-Based Testing: Stavový automat + Kontrakty

1. **Aplikace = stavový automat** — ne "sbírka stránek", ale stavy a definované přechody
2. **Dialog = kontrakt** — každý screen/dialog má preconditions, action, postconditions, invariants
3. **Stavový automat → generování scénářů** — transition coverage, path coverage, happy path
4. **Dvě vrstvy nad sebou**: FSM generuje scénáře → Reactive Testing je vykonává a validuje
5. **Typový systém jako smlouva** — `DialogContract`, `AppState`, `Transition` jsou TypeScript interfaces, ne komentáře
6. **Člověk definuje model, stroj generuje scénáře** — systematické pokrytí místo ad-hoc testů

## Priorita vůči ostatním projektům

| Priorita | Projekt                          | ROI                                       |
|----------+----------------------------------+-------------------------------------------|
| 🥇       | **Reactive Testing POC** (tento) | 1–2 týdny → demo, přímá mapa na QA role |
| 🥈       | Krakatoa (matching engine)       | Důkaz doménové znalosti, ne hlavní POW   |
| 🥉       | gtd-trading (Wyckoff/P&F)        | Hluboká trading doména, není QA projekt  |

**Doporučení:** 100 % do Reactive Testing POC. Krakatoa a gtd-trading zmínit jako doménové znalosti, ne jako další POW.

## ROI: Reactive Testing POC napříč pracovními nabídkami

Tento projekt není jen pro Kraken. Je to **nejuniverzálnější POW** — jeden projekt, hodnota pro 6 ze 7 aktuálních nabídek.

Hodnocení: ★★★ = přímý match/důkaz, ★★☆ = relevantní, ★☆☆ = okrajově.

| Projekt                    | Čas    | Kraken QA🥇 | Jobgether🥈 | 8am🥈    | IP Fabric🥈 | Semrush🥈 | Bloomreach | Flexiana🥉 |
|----------------------------+--------+-------------+-------------+----------+-------------+-----------+------------+------------|
| **Reactive Testing POC**   | 1-2 týd | ★★★        | ★★☆        | ★★★     | ★★★        | ★★★      | ★★★       | ★★☆       |
| Baťa Simulation            | 1-2 týd | ★★☆        | ★★★        | ★★★     | ★★☆        | ★★☆      | ★★☆       | ★★☆       |
| Krakatoa (Jepsen)          | 3-5 dní | ★★★        | ★★☆        | ★★☆     | ★★☆        | ★★☆      | ★☆☆       | ★★★       |
| JanBot (RAG/LangChain)     | 2-3 týd | ★☆☆        | ★☆☆        | ★★★     | ★☆☆        | ★★★      | ★★☆       | ★☆☆       |

**VÁŽENÉ SKÓRE (★★★=3, ★★☆=2, ★☆☆=1):**
- Reactive Testing POC: **27 bodů** 🥇
- Baťa Simulation: 20 bodů 🥈
- Krakatoa (Jepsen): 18 bodů 🥉
- JanBot: 16 bodů

**Závěr:** Reactive Testing POC má nejširší dopad — KRITICKÝ pro Kraken (primární cíl), SILNÝ pro dalších 5 QA pozic. Jeden projekt = důkaz pro 6 ze 7 nabídek.

### Shoda s požadavky firem (detail)

| Firma        | Klíčový požadavek          | Best POW match           | Sekundární POW         |
|--------------+----------------------------+--------------------------+------------------------|
| Kraken Pro   | Playwright, MCP, trading   | Reactive Testing POC     | Krakatoa               |
| Jobgether    | SQL, backend, fronty       | Baťa Simulation          | Reactive Testing       |
| 8am          | SQL, AI, observabilita     | Baťa Simulation          | Reactive Testing       |
| IP Fabric    | Playwright, networking     | Reactive Testing POC     | Krakatoa (Jepsen)      |
| Semrush      | Playwright, Python, QA     | Reactive Testing POC     | Baťa (SQL gap filler)  |
| Bloomreach   | Playwright, první QA, AI   | Reactive Testing POC     | JanBot (AI tools)      |
| Flexiana     | Clojure, IaC, AWS          | Krakatoa                 | Reactive Testing (CLJS)|

Zdroj: [[file:~/org/h1_horizon/hledam-praci-2026.org::*ROI Matice Projektů (srpen 2026)][ROI Matice Projektů]]

## Hodnota pro různé role

| Když mluvíš s...      | Zdůrazníš...                                                             |
|------------------------+-------------------------------------------------------------------------|
| QA manažerem           | Playwright nativně, architektura testování, MCP workflow                 |
| Senior QA Engineer     | Spec-driven typy, interceptor chain, snapshot-driven generování, MBT/FSM |
| Platform Engineering   | CDP, TestDriver protocol, CI/CD, observabilita, typová bezpečnost       |
| Engineering Manager    | Týmová kompatibilita (TS stack), architektura místo skriptů              |
| Recruiterem (obecně)   | "Testy generované z formálního modelu aplikace"                          |

### Klíčové signály pro Kraken pohovor

| Signál                                       | Jak ho projekt demonstruje                                    |
|----------------------------------------------+---------------------------------------------------------------|
| Playwright na architektonické úrovni         | Orchestrátor nad CDP, ne jen `page.click()`                   |
| Systematické, ne ad-hoc testování            | AppModel → generované scénáře s měřitelným pokrytím           |
| AI jako nástroj produktivity, ne náhrada     | MCP jako pair programmer, AI generuje kód, člověk schvaluje   |
| Rozumím trading doméně                       | Order book, limit/market order, balance, P&L — v modelu i validacích |
| Myslím za hranice "psaní testů"              | Dvoufázový model, state reuse, FSM, kontrakty                 |
| Umím dodat                                       | 1–2 týdny od nuly k funkčnímu demu

## Otevřené otázky / Brainstorming

- Konkrétní podoba POC dema — co přesně demo ukazuje? (Kraken Pro order flow?)
- Jak detailní má být AppModel? Všechny dialogy, nebo jen critical path?
- Jak ověřit, že AppModel odpovídá reálné aplikaci? (synchronizace modelu s UI)
- Generování AppModelu z accessibility snapshotu? (AI projde app → navrhne stavy a přechody)
- TestDriver protocol — jak abstrahovat nad Playwright + Appium (mobil)?
- Global Invariants (Property-Based Testing nad snapshoty)?
- Mutation Testing — jak ověřit kvalitu samotných validačních aspektů?
- Jak vypadá CI/CD integrace — AppModel v gitu, generované scénáře jako build artifact?
