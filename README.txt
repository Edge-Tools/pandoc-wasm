pandoc-wasm — Corresponding Source mirror
==================================================

This repository publishes the Corresponding Source for the WebAssembly
build of pandoc (license: GPL-2.0-or-later) used in edgetools.io.

Contents
  build/      our build recipe: Dockerfile + helper scripts/config/patches.
              Rebuild with:  docker build build/
  upstream/   the exact upstream source archive(s) the build fetched,
              byte-identical and sha256-verified (see below).

Upstream sources:
  pandoc
    https://github.com/haskell-wasm/pandoc.git
    commit 336228bb8d5e9bf35750cfe6b546ffb4bcd86c15
