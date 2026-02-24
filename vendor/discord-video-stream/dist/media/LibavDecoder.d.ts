import { type Frame, type Packet, type Stream } from "node-av";
export declare function createDecoder(stream: Stream): Promise<{
    decode: (packets: Packet) => Promise<Frame[]>;
    free: () => Promise<void>;
}>;
