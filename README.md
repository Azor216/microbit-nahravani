# Přenos audio mezi micro:bity V2 — experiment "max kvality"

Vlastní MakeCode rozšíření v C++ + TS, které **přenese skutečný (byť bídný) zvuk**
přes radio mezi dvěma+ micro:bity V2.

> ⚠️ **Experimentální.** Stock MakeCode tohle neumí — sahá se přímo do
> CODAL audio pipeline. Funkčnost potvrzená na úrovni návrhu, ale
> doladění na reálném HW může být potřeba.

## Jak to funguje

1. **C++ extension `audioradio`** (přímo v projektu, soubor `audioradio.cpp`):
   - `MicSink` se připojí na `uBit.audio.splitter` a zachycuje samply z mikrofonu.
   - Konvertuje je z 16-bit signed PCM na 8-bit unsigned a downsampluje 2× → ~5.5 kHz × 8 bit.
   - Ukládá do interního pole (max 8 KB ≈ 1.45 s zvuku).
   - `BufSource` je `DataSource` připojený k `MixerChannel` → umí přehrát buffer.
   - Vystavuje TS shimy: `startCapture`, `captureLength`, `captureGetChunk`,
     `playPrepare`, `playWriteChunk`, `playStart`, …

2. **TS `main.ts`**:
   - Po puštění A vezme buffer po 14B chuncích, přidá 2B sekvenční číslo a
     pošle přes `radio.sendBuffer`.
   - Příjemce čeká na **header** packet (`0xFE` + délka), pak `playPrepare`,
     skládá data podle seq, na **footer** (`0xFF`) spustí `playStart`.

## Ovládání (nahraj stejný .hex na všechny micro:bity)

| Tlačítko | Akce |
|----------|------|
| **A** (drž) | Nahraje (max ~1.45 s) a po puštění odešle ostatním |
| **B** | Přepne kanál (radio skupina 1–9) |
| **A + B** | Lokální test (nahraje a hned přehraje na sobě) |
| **Logo** | Přehraje poslední přijatou nahrávku znovu |

## Limity / co čekat

| Parametr | Hodnota |
|----------|---------|
| Sample rate | 5500 Hz |
| Bit depth | 8 bit unsigned |
| Max délka nahrávky | ~1.45 s (8000 B) |
| Velikost přenosu | ~8 KB / nahrávka |
| Doba přenosu | **5–15 s** (záleží na rušení) |
| Spolehlivost | Žádné ACK — ztracený packet = ticho / lupanec |
| Kvalita | Telefonní šepot, rozpoznáš slova |

## Import do MakeCode

1. Otevři <https://makecode.microbit.org>.
2. **Import → Import File…** → vyber **celou složku** zazipovanou
   (`Compress-Archive c:\Projects\nahravani\* nahravani.zip`) a nahraj
   `.zip` jako projekt.
   - (Nebo přes GitHub: nahraj složku do repa a importuj z URL.)
3. MakeCode spustí cloud build C++ — chvíli to trvá.
4. Pokud build selže (`audioradio.cpp` se nezkompiluje), pošli mi chyby z
   konzole MakeCode (F12 → Console). Můžu doladit `pull()` / formát samplů.
5. Vyber **micro:bit V2**, **Download**, hex na disk MICROBIT.

## Pokud to nehraje

- **Záznam je hluchý** → zvyš zesílení mikrofonu (v `audioradio.cpp` lze
  přidat volání `uBit.audio.processor->setGain(1.0)` v `ensureCapture`).
- **Přehrávání je tiché** → zvyš `setVolume` v `ensurePlayer` (až 1023).
- **Lupance / zkomolené** → poloviční sample rate (2750 Hz) nebo větší
  `PACKET_GAP_MS` v `main.ts`.
- **Nic se nepřenáší** → ujisti se, že mají oba mikrobity stejný kanál
  (zobrazí se po startu nebo po stisku B).

## Soubory

| Soubor | Účel |
|--------|------|
| `pxt.json` | Konfigurace projektu (dependencies, files, V2 only) |
| `audioradio.cpp` | C++ extension — přístup k mikrofonu/reproduktoru přes CODAL |
| `shims.d.ts` | Deklarace TS shimů z C++ funkcí |
| `main.ts` | Aplikace — radio chunking, ovládání tlačítky |
| `README.md` | Tento soubor |
