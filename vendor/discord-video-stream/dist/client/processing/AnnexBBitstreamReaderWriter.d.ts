export declare class AnnexBBitstreamReader {
    private _buffer;
    private _byteOffset;
    private _bitOffset;
    constructor(buffer: Buffer);
    readBits(count: number): number;
    readUnsigned(bits: number): number;
    readSigned(bits: number): number;
    readUnsignedExpGolomb(): number;
    readSignedExpGolomb(): number;
}
export declare class AnnexBBitstreamWriter {
    private _arr;
    private _pendingByte;
    private _bitOffset;
    toBuffer(): Buffer<ArrayBuffer>;
    flush(): void;
    writeBits(bits: number, count: number): void;
    writeUnsigned(num: number, count: number): void;
    writeSigned(num: number, count: number): void;
    writeUnsignedExpGolomb(num: number): void;
    writeSignedExpGolomb(num: number): void;
}
