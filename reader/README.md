# The reader

Tesseract, vendored, so a sailor screenshot is read in the browser and
never leaves the machine. Nothing here is ours:

| file | from | version |
| --- | --- | --- |
| `tesseract-7.0.0.esm.min.js` | `tesseract.js` (`dist/tesseract.esm.min.js`) | 7.0.0 |
| `tesseract-worker-7.0.0.min.js` | `tesseract.js` (`dist/worker.min.js`) | 7.0.0 |
| `tesseract-core-6.0.0-simd-lstm.wasm.js` | `tesseract.js-core` | 6.0.0 |
| `tessdata/eng.traineddata.gz` | `@tesseract.js-data/eng` (`4.0.0_best_int`) | 1.0.0 |

Both licences are beside them: Apache 2.0.

Only the SIMD, LSTM-only core is kept -- the legacy engine doubles the
download and this app never asks for it, and every browser that can run
the app has had WebAssembly SIMD since 2021. The names carry the version
because these files are served immutable and cached across deploys
(`sw.js` files them with the icons and the tiles, not with the code), so
a new version must arrive under a new name. `eng.traineddata.gz` cannot:
Tesseract composes that filename itself, so the version sits on the
directory instead.

To lift a version, `npm pack` the package, copy the file in under a new
name, and change the one place that names it: `js/shot-reader.js`.
