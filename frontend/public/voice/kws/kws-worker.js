/*
 * "Hey FinTwin" spotted on the device: sherpa-onnx keyword spotting
 * (Apache-2.0, see SHERPA-ONNX-LICENSE) with the English GigaSpeech 3.3M
 * model (Apache-2.0), compiled to WebAssembly. The page sends 16 kHz audio
 * here; nothing is sent anywhere else, and only "wake" comes back.
 */
/* global createKws, importScripts */
let kws = null;
let stream = null;
let pending = null;

function build(keywords) {
    kws = createKws(self.Module, {
        featConfig: { samplingRate: 16000, featureDim: 80 },
        modelConfig: {
            transducer: {
                encoder: "./encoder-epoch-12-avg-2-chunk-16-left-64.onnx",
                decoder: "./decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
                joiner: "./joiner-epoch-12-avg-2-chunk-16-left-64.onnx",
            },
            tokens: "./tokens.txt",
            provider: "cpu",
            modelType: "",
            numThreads: 1,
            debug: 0,
            modelingUnit: "bpe",
            bpeVocab: "",
        },
        maxActivePaths: 8,
        numTrailingBlanks: 1,
        keywordsScore: 2.0,
        keywordsThreshold: 0.2,
        keywords,
    });
    stream = kws.createStream();
    self.postMessage({ type: "ready" });
}

self.Module = {
    locateFile: (path) => self.location.href.replace(/[^/]*$/, "") + path,
    print: () => {},
    printErr: () => {},
    onRuntimeInitialized() {
        if (pending !== null) build(pending);
        else pending = true;
    },
};

self.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === "init") {
        if (pending === true) build(m.keywords);
        else pending = m.keywords;
    } else if (m.type === "audio" && kws) {
        stream.acceptWaveform(16000, m.samples);
        while (kws.isReady(stream)) {
            kws.decode(stream);
            const r = kws.getResult(stream);
            if (r && r.keyword) {
                kws.reset(stream);
                self.postMessage({ type: "wake", keyword: r.keyword });
            }
        }
    } else if (m.type === "reset" && kws) {
        stream.free();
        stream = kws.createStream();
    }
};

try {
    importScripts("sherpa-onnx-kws.js", "sherpa-onnx-wasm-kws-main.js");
} catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
}
