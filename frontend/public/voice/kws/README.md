# "Hey FinTwin" keyword spotter

sherpa-onnx v1.13.8 keyword spotting compiled to WebAssembly (Apache-2.0,
`SHERPA-ONNX-LICENSE`), with the English model
`sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` (int8, Apache-2.0)
packed into `sherpa-onnx-wasm-kws-main.data`.

- `kws-worker.js` is ours: it runs the spotter in a Web Worker and reports
  only "wake". The keyword list is sent from `src/services/wakeWord.js`.
- The other files are the build output of `build-wasm-simd-kws.sh`, made in
  Cloud Build with `emscripten/emsdk:4.0.23` (int8 encoder/decoder/joiner
  renamed to the names the build expects). To rebuild, run that build again
  and copy `sherpa-onnx-wasm-kws-main.{js,wasm,data}` and `sherpa-onnx-kws.js`.

Measured on made-up clips (Gemini TTS voices, Indian and American accents):
10 of 16 "Hey FinTwin" caught, 1 false wake in 15 decoys ("Hey, fine,
twenty..."), ~33× faster than real time on one core.
