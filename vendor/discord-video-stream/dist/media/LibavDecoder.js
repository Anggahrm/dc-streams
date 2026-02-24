import { Decoder, FilterAPI, } from "node-av";
export async function createDecoder(stream) {
    const decoder = await Decoder.create(stream);
    let freed = false;
    let serializer = null;
    const serialize = (f) => {
        let p;
        if (serializer) {
            p = serializer.catch(() => { }).then(() => f());
        }
        else {
            p = f();
        }
        serializer = p = p.finally(() => {
            if (serializer === p)
                serializer = null;
        });
        return p;
    };
    const filter = FilterAPI.create("format=pix_fmts=rgba");
    return {
        decode: async (packets) => {
            if (freed)
                return [];
            return serialize(async () => {
                const frames = await decoder.decodeAll(packets);
                let filtered = [];
                for (const frame of frames) {
                    filtered = [...filtered, ...(await filter.processAll(frame))];
                }
                return filtered;
            });
        },
        free: () => {
            freed = true;
            return serialize(async () => {
                decoder.close();
                filter.close();
            });
        },
    };
}
//# sourceMappingURL=LibavDecoder.js.map