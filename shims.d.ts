// Auto-generated style. Deklarace shimů do TS pro funkce z audioradio.cpp.
declare namespace audioradio {
    /**
     * Spustí záznam audio dat z mikrofonu do interního bufferu.
     * @param sampleRate vzorkovací frekvence v Hz (např. 5500)
     * @param maxBytes maximální počet bajtů k zaznamenání (max 8192)
     */
    //% shim=audioradio::startCapture
    function startCapture(sampleRate: int32, maxBytes: int32): void;

    //% shim=audioradio::stopCapture
    function stopCapture(): void;

    //% shim=audioradio::captureLength
    function captureLength(): int32;

    //% shim=audioradio::isCapturing
    function isCapturing(): boolean;

    /**
     * Vrátí chunk zachycených dat jako Buffer.
     */
    //% shim=audioradio::captureGetChunk
    function captureGetChunk(offset: int32, length: int32): Buffer;

    /**
     * Připraví přehrávací buffer.
     */
    //% shim=audioradio::playPrepare
    function playPrepare(sampleRate: int32, totalBytes: int32): void;

    /**
     * Zapíše chunk dat do přehrávacího bufferu na danou pozici.
     */
    //% shim=audioradio::playWriteChunk
    function playWriteChunk(offset: int32, chunk: Buffer): void;

    //% shim=audioradio::playStart
    function playStart(): void;

    //% shim=audioradio::isPlaying
    function isPlaying(): boolean;
}
