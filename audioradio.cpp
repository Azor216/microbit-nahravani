/*
 * audioradio - vlastní MakeCode rozšíření pro micro:bit V2
 *
 * Vystavuje:
 *  - startCapture / stopCapture / captureLength / captureGetChunk
 *      -> zachytává surová audio data z mikrofonu (8-bit unsigned, downsampled)
 *        do interního bufferu a umožňuje TS kódu si je vyzvednout po blocích.
 *  - playPrepare / playWriteChunk / playStart / isPlaying
 *      -> umožňuje TS kódu naskládat samply (přijaté z radia) do druhého
 *        bufferu a přehrát je přes reproduktor přes MixerChannel.
 *
 * Pouze micro:bit V2 (CODAL). Na V1 funkce nic nedělají.
 */
#include "pxt.h"
#include "MicroBit.h"

#if MICROBIT_CODAL
#include "DataStream.h"
#endif

using namespace pxt;

namespace audioradio {

// Velikost interního bufferu v B. micro:bit V2 má 128 KB RAM,
// audio-recording extension dává default 50 KB. Tady 32 KB pro nahrání
// a 32 KB pro přehrání = 64 KB. Při 5500 Hz × 8-bit = ~5.9 s nahrávky.
#define AR_MAX_BUFFER 32768

#if MICROBIT_CODAL

static uint8_t  captureData[AR_MAX_BUFFER];
static uint8_t  playData[AR_MAX_BUFFER];
static volatile int  captureLen = 0;
static volatile int  captureCap = AR_MAX_BUFFER;
static volatile bool capturing  = false;
static volatile int  playLen    = 0;
static volatile int  playPos    = 0;
static volatile bool playing    = false;

// -------- DataSink: čte samply z mikrofonu --------------------------------
class MicSink : public DataSink {
public:
    SplitterChannel *src;
    MicSink(SplitterChannel *s) : src(s) { src->connect(*this); }

    virtual int pullRequest() {
        ManagedBuffer b = src->pull();
        if (!capturing) return DEVICE_OK;

        uint8_t *bytes = b.getBytes();
        int n          = b.length();
        int fmt        = src->getFormat();

        // Downsample 2x (každý druhý sample) pro snížení datového toku
        if (fmt == DATASTREAM_FORMAT_16BIT_SIGNED ||
            fmt == DATASTREAM_FORMAT_16BIT_UNSIGNED) {
            for (int i = 0; i + 1 < n && captureLen < captureCap; i += 4) {
                int16_t v = (int16_t)(bytes[i] | (bytes[i + 1] << 8));
                if (fmt == DATASTREAM_FORMAT_16BIT_UNSIGNED) v = v - 32768;
                captureData[captureLen++] = (uint8_t)((v >> 8) + 128);
            }
        } else if (fmt == DATASTREAM_FORMAT_8BIT_SIGNED) {
            for (int i = 0; i < n && captureLen < captureCap; i += 2) {
                captureData[captureLen++] = (uint8_t)((int8_t)bytes[i] + 128);
            }
        } else { // 8-bit unsigned nebo unknown
            for (int i = 0; i < n && captureLen < captureCap; i += 2) {
                captureData[captureLen++] = bytes[i];
            }
        }
        if (captureLen >= captureCap) capturing = false;
        return DEVICE_OK;
    }
};

// -------- DataSource: dodává samply do mixéru -----------------------------
class BufSource : public DataSource {
public:
    DataSink *downstream;
    BufSource() : downstream(NULL) {}

    virtual ManagedBuffer pull() {
        int remain = playLen - playPos;
        if (!playing || remain <= 0) {
            playing = false;
            // tichá obálka, aby mixér měl co tahat
            ManagedBuffer silence(128 * 2);
            memset(silence.getBytes(), 0, silence.length());
            return silence;
        }
        int n = remain < 128 ? remain : 128;
        ManagedBuffer out(n * 2);
        uint8_t *dst = out.getBytes();
        for (int i = 0; i < n; i++) {
            // 8-bit unsigned (offset 128) -> 16-bit signed, zesílit
            int16_t v = (int16_t)((int)playData[playPos + i] - 128) << 7;
            dst[i * 2]     = v & 0xFF;
            dst[i * 2 + 1] = (v >> 8) & 0xFF;
        }
        playPos += n;
        return out;
    }

    virtual void connect(DataSink &sink) { downstream = &sink; }
    virtual void disconnect()            { downstream = NULL; }
    virtual int  getFormat()             { return DATASTREAM_FORMAT_16BIT_SIGNED; }
};

static SplitterChannel *inChan  = NULL;
static MicSink         *micSink = NULL;
static BufSource       *bufSrc  = NULL;
static MixerChannel    *mixChan = NULL;

static void ensureCapture(int sampleRate) {
    if (inChan == NULL) {
        MicroBitAudio::requestActivation();
        uBit.audio.activateMic();
        inChan  = uBit.audio.splitter->createChannel();
        uBit.audio.mic->setSampleRate(sampleRate);
        micSink = new MicSink(inChan);
    } else {
        uBit.audio.mic->setSampleRate(sampleRate);
    }
}

static void ensurePlayer(int sampleRate) {
    if (bufSrc == NULL) {
        MicroBitAudio::requestActivation();
        uBit.audio.setSpeakerEnabled(true);
        bufSrc  = new BufSource();
        mixChan = uBit.audio.mixer.addChannel(*bufSrc, sampleRate);
        mixChan->setVolume(100.0);
        uBit.audio.mixer.setVolume(1000);
    }
}

#endif // MICROBIT_CODAL

// ===== EXPORTOVANÉ FUNKCE (shim do TS) ====================================

/**
 * Spustí záznam zvuku do interního bufferu.
 */
//% shim=audioradio::startCapture
void startCapture(int sampleRate, int maxBytes) {
#if MICROBIT_CODAL
    if (maxBytes > AR_MAX_BUFFER) maxBytes = AR_MAX_BUFFER;
    ensureCapture(sampleRate);
    captureLen = 0;
    captureCap = maxBytes;
    capturing  = true;
#endif
}

/**
 * Ručně ukončí záznam.
 */
//% shim=audioradio::stopCapture
void stopCapture() {
#if MICROBIT_CODAL
    capturing = false;
#endif
}

/**
 * Vrátí počet bajtů, které jsou aktuálně v záznamu.
 */
//% shim=audioradio::captureLength
int captureLength() {
#if MICROBIT_CODAL
    return captureLen;
#else
    return 0;
#endif
}

/**
 * True dokud probíhá záznam.
 */
//% shim=audioradio::isCapturing
bool isCapturing() {
#if MICROBIT_CODAL
    return capturing;
#else
    return false;
#endif
}

/**
 * Vyzvedne chunk záznamu jako Buffer.
 */
//% shim=audioradio::captureGetChunk
Buffer captureGetChunk(int offset, int length) {
#if MICROBIT_CODAL
    if (offset < 0)             offset = 0;
    if (offset >= captureLen)   return mkBuffer(NULL, 0);
    int avail = captureLen - offset;
    if (length > avail) length = avail;
    if (length <= 0)            return mkBuffer(NULL, 0);
    return mkBuffer(&captureData[offset], length);
#else
    return mkBuffer(NULL, 0);
#endif
}

/**
 * Připraví přehrávací buffer (vynuluje, nastaví sample rate).
 */
//% shim=audioradio::playPrepare
void playPrepare(int sampleRate, int totalBytes) {
#if MICROBIT_CODAL
    if (totalBytes > AR_MAX_BUFFER) totalBytes = AR_MAX_BUFFER;
    ensurePlayer(sampleRate);
    playing = false;
    playPos = 0;
    playLen = totalBytes;
    memset(playData, 128, AR_MAX_BUFFER); // ticho (8-bit unsigned středová úroveň)
#endif
}

/**
 * Zapíše chunk dat do přehrávacího bufferu na danou pozici.
 */
//% shim=audioradio::playWriteChunk
void playWriteChunk(int offset, Buffer chunk) {
#if MICROBIT_CODAL
    if (offset < 0 || chunk == NULL) return;
    int n = chunk->length;
    if (offset + n > AR_MAX_BUFFER) n = AR_MAX_BUFFER - offset;
    if (n <= 0) return;
    memcpy(&playData[offset], chunk->data, n);
#endif
}

/**
 * Spustí přehrávání připraveného bufferu.
 */
//% shim=audioradio::playStart
void playStart() {
#if MICROBIT_CODAL
    if (bufSrc == NULL) return;
    playPos = 0;
    playing = true;
#endif
}

/**
 * True dokud probíhá přehrávání.
 */
//% shim=audioradio::isPlaying
bool isPlaying() {
#if MICROBIT_CODAL
    return playing;
#else
    return false;
#endif
}

} // namespace audioradio
