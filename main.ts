// @ts-nocheck
// =====================================================================
// PŘENOS AUDIO MEZI micro:bity V2 PŘES RADIO  (experiment "max kvality")
// =====================================================================
// Princip:
//   1. TX micro:bit nahraje cca 1.5 s zvuku přes vlastní C++ extension
//      audioradio (8-bit unsigned, 5500 Hz → ~8 KB samplů).
//   2. TS kód rozseká buffer na 14-bajtové chunky, ke každému přidá
//      2B pořadové číslo, pošle přes radio.sendBuffer.
//   3. RX micro:bit přijímá:
//        - header packet (magic 0xFE)  → playPrepare
//        - data packety (seq + samply) → playWriteChunk
//        - footer packet (magic 0xFF)  → playStart
//   4. Audio se přehraje přes reproduktor přes MixerChannel.
//
// Ovládání:
//   A (drž)   = nahrát zvuk (max ~1.5 s, do puštění A nebo do zaplnění)
//                po puštění se automaticky pošle ostatním
//   B         = přepnout kanál (radio skupina 1-9)
//   Logo      = přehrát poslední přijatou nahrávku znovu
//   A + B     = lokální test (nahrát + ihned přehrát na sobě)
//
// LIMITY / VAROVÁNÍ:
//   - Kvalita ~ telefonní šepot (5.5 kHz 8-bit, žádná komprese).
//   - Přenos 8 KB přes radio trvá řádově 5-15 s podle rušení.
//   - Žádné ACK / retransmise – ztracené packety = chybějící samply
//     (slyšet jako lupance/cvakání).
// =====================================================================

const SAMPLE_RATE   = 5500
const MAX_BYTES     = 8000   // ~1.45 s nahrávky
const CHUNK_DATA    = 14     // bajtů samplů na 1 radio packet
const PACKET_GAP_MS = 6      // pauza mezi packety
const MAGIC_HEADER  = 0xFE
const MAGIC_FOOTER  = 0xFF
const KANAL_START   = 7

let kanal       = KANAL_START
let rxTotal     = 0
let rxRecvBytes = 0
let rxActive    = false
let rxMaPlnou   = false

// ---------- LED ikony -------------------------------------------------
function ukazMikrofon() {
    basic.showLeds(`
        . # . # .
        # # # # #
        # # # # #
        . # # # .
        . . # . .
        `)
}

function ukazAntenu() {
    basic.showLeds(`
        # . # . #
        . # # # .
        . . # . .
        . . # . .
        . . # . .
        `)
}

function ukazReproduktor() {
    basic.showLeds(`
        # . . . .
        # # . . .
        # # # . .
        # # . . .
        # . . . .
        `)
}

// ---------- start ------------------------------------------------------
radio.setGroup(kanal)
radio.setTransmitPower(7)
basic.showIcon(IconNames.Heart)
basic.pause(400)
basic.showNumber(kanal)
basic.pause(500)
basic.clearScreen()

// ---------- vyslat nahraný buffer přes radio --------------------------
function odeslatNahravku(total: number) {
    const hdr = control.createBuffer(3)
    hdr.setNumber(NumberFormat.UInt8LE, 0, MAGIC_HEADER)
    hdr.setNumber(NumberFormat.UInt16LE, 1, total)
    radio.sendBuffer(hdr)
    basic.pause(15)

    let seq = 0
    for (let offset = 0; offset < total; offset += CHUNK_DATA) {
        const n = Math.min(CHUNK_DATA, total - offset)
        const data = audioradio.captureGetChunk(offset, n)
        const pkt = control.createBuffer(2 + n)
        pkt.setNumber(NumberFormat.UInt16LE, 0, seq)
        for (let i = 0; i < n; i++) {
            pkt.setNumber(
                NumberFormat.UInt8LE,
                2 + i,
                data.getNumber(NumberFormat.UInt8LE, i)
            )
        }
        radio.sendBuffer(pkt)
        seq++
        if (seq % 16 == 0) {
            led.toggle(seq % 5, (Math.idiv(seq, 5)) % 5)
        }
        basic.pause(PACKET_GAP_MS)
    }

    const ftr = control.createBuffer(1)
    ftr.setNumber(NumberFormat.UInt8LE, 0, MAGIC_FOOTER)
    radio.sendBuffer(ftr)
}

// ---------- A: NAHRÁT a POSLAT ----------------------------------------
input.onButtonPressed(Button.A, function () {
    ukazMikrofon()
    audioradio.startCapture(SAMPLE_RATE, MAX_BYTES)
    while (input.buttonIsPressed(Button.A) && audioradio.isCapturing()) {
        basic.pause(40)
    }
    audioradio.stopCapture()
    const total = audioradio.captureLength()
    basic.showIcon(IconNames.Yes)
    basic.pause(200)
    ukazAntenu()
    odeslatNahravku(total)
    basic.showIcon(IconNames.Yes)
    basic.pause(300)
    basic.clearScreen()
})

// ---------- A+B: lokální test (nahrát + přehrát na sobě) --------------
input.onButtonPressed(Button.AB, function () {
    ukazMikrofon()
    audioradio.startCapture(SAMPLE_RATE, MAX_BYTES)
    while ((input.buttonIsPressed(Button.A) || input.buttonIsPressed(Button.B))
        && audioradio.isCapturing()) {
        basic.pause(40)
    }
    audioradio.stopCapture()
    const total = audioradio.captureLength()
    audioradio.playPrepare(SAMPLE_RATE, total)
    for (let off = 0; off < total; off += 64) {
        const n = Math.min(64, total - off)
        audioradio.playWriteChunk(off, audioradio.captureGetChunk(off, n))
    }
    ukazReproduktor()
    audioradio.playStart()
    while (audioradio.isPlaying()) basic.pause(50)
    basic.clearScreen()
})

// ---------- B: přepnout kanál -----------------------------------------
input.onButtonPressed(Button.B, function () {
    kanal = kanal % 9 + 1
    radio.setGroup(kanal)
    basic.showNumber(kanal)
    basic.pause(500)
    basic.clearScreen()
})

// ---------- Logo: přehrát naposled přijatou nahrávku znovu ------------
input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    if (!rxMaPlnou) {
        basic.showIcon(IconNames.No)
        basic.pause(400)
        basic.clearScreen()
        return
    }
    ukazReproduktor()
    audioradio.playStart()
    while (audioradio.isPlaying()) basic.pause(50)
    basic.clearScreen()
})

// ---------- PŘÍJEM přes radio -----------------------------------------
radio.onReceivedBuffer(function (buf) {
    if (buf.length == 0) return
    const first = buf.getNumber(NumberFormat.UInt8LE, 0)

    // header
    if (buf.length == 3 && first == MAGIC_HEADER) {
        rxTotal     = buf.getNumber(NumberFormat.UInt16LE, 1)
        rxRecvBytes = 0
        rxActive    = true
        rxMaPlnou   = false
        audioradio.playPrepare(SAMPLE_RATE, rxTotal)
        ukazAntenu()
        return
    }

    // footer
    if (buf.length == 1 && first == MAGIC_FOOTER) {
        if (rxActive) {
            rxActive  = false
            rxMaPlnou = true
            ukazReproduktor()
            audioradio.playStart()
        }
        return
    }

    // data packet
    if (rxActive && buf.length >= 3) {
        const seq     = buf.getNumber(NumberFormat.UInt16LE, 0)
        const offset  = seq * CHUNK_DATA
        const dataLen = buf.length - 2
        if (offset + dataLen <= MAX_BYTES) {
            const chunk = buf.slice(2, dataLen)
            audioradio.playWriteChunk(offset, chunk)
            rxRecvBytes += dataLen
            led.plotBarGraph(rxRecvBytes, rxTotal)
        }
    }
})
