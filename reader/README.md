# The reader

Tesseract, vendored, so a sailor screenshot is read in the browser and
never leaves the machine. Nothing here is ours:

| file | from | version |
| --- | --- | --- |
| `tesseract-7.0.0.esm.min.js` | `tesseract.js` (`dist/tesseract.esm.min.js`) | 7.0.0 |
| `tesseract-worker-7.0.0.min.js` | `tesseract.js` (`dist/worker.min.js`) | 7.0.0 |
| `tesseract-core-6.0.0-simd-lstm.wasm.js` | `tesseract.js-core` | 6.0.0 |
| `tessdata/eng.traineddata.gz` | `@tesseract.js-data/eng` (`4.0.0_best_int`) | 1.0.0 |
| `tessdata/rus.traineddata.gz` | `@tesseract.js-data/rus` (`4.0.0_best_int`) | 1.0.0 |
| `tessdata/jpn.traineddata.gz` | `@tesseract.js-data/jpn` (`4.0.0_best_int`) | 1.0.0 |
| `tessdata/kor.traineddata.gz` | `@tesseract.js-data/kor` (`4.0.0_best_int`) | 1.0.0 |
| `tessdata/chi_sim.traineddata.gz` | `@tesseract.js-data/chi_sim` (`4.0.0_best_int`) | 1.0.0 |
| `tessdata/chi_tra.traineddata.gz` | `@tesseract.js-data/chi_tra` (`4.0.0_best_int`) | 1.0.0 |
| `tessdata/tha.traineddata.gz` | `@tesseract.js-data/tha` (`4.0.0_best_int`) | 1.0.0 |

Both licences are beside them: Apache 2.0.

Only the SIMD, LSTM-only core is kept -- the legacy engine doubles the
download and this app never asks for it, and every browser that can run
the app has had WebAssembly SIMD since 2021. The names carry the version
because these files are served immutable and cached across deploys
(`sw.js` files them with the icons and the tiles, not with the code), so
a new version must arrive under a new name. `eng.traineddata.gz` cannot:
Tesseract composes that filename itself, so the version sits on the
directory instead.

## The language models

One a script, not one a service. The game's language menu lists
sixteen, and the ten Latin ones (English, Deutsch, Français, both
Españols, Português, Türkçe, Basa Indonesia, SEA English, Global Lab)
all read on `eng`: it makes out an umlaut or a cedilla well enough for
a name that can be corrected by hand in the review table, and it saves
them a download for a gain nobody would notice. The other six each need
their own script, and `js/sailor-locales.js` is where a service is tied
to one.

None of them is fetched on an ordinary load, or even on an ordinary
read: the engine asks for one when a language is first chosen, it is
one to three megabytes, and it is then cached like the rest of this
folder. Only one is held at a time -- a player reads a batch in one
language, not two -- so switching lets the last one go.

`4.0.0_best_int` throughout: the float models are three to four times
the size for accuracy this does not need, and the `fast` ones lose
enough on small pale glyphs to matter.

To lift a version, `npm pack` the package, copy the file in under a new
name, and change the one place that names it: `js/shot-reader.js`. The
language files cannot carry a version in their names -- Tesseract
composes those itself from the language code -- so a new set of them
needs a new directory, and `TESSDATA` in `js/shot-reader.js` is the one
place that says which.
