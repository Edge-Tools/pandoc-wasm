FROM haskell:9.12.2-slim-bookworm AS toolchain

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl jq unzip zstd xz-utils ca-certificates make \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ARG WASMTIME_VERSION=45.0.0
RUN set -eux; \
    case "$(uname -m)" in \
      x86_64)        WT=x86_64-linux ;; \
      aarch64|arm64) WT=aarch64-linux ;; \
      *) echo "unsupported arch $(uname -m)"; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/wasmtime.tar.xz \
      "https://github.com/bytecodealliance/wasmtime/releases/download/v${WASMTIME_VERSION}/wasmtime-v${WASMTIME_VERSION}-${WT}.tar.xz"; \
    tar -xJf /tmp/wasmtime.tar.xz -C /tmp; \
    cp "/tmp/wasmtime-v${WASMTIME_VERSION}-${WT}/wasmtime" /usr/local/bin/; \
    rm -rf /tmp/wasmtime*; \
    wasmtime --version

RUN set -eux; \
    cabal update; \
    cabal install --install-method=copy --installdir=/usr/local/bin alex happy; \
    alex --version; happy --version

ARG GHC_FLAVOUR=9.14
RUN set -eux; \
    curl -fsSL https://gitlab.haskell.org/haskell-wasm/ghc-wasm-meta/-/raw/master/bootstrap.sh \
      | FLAVOUR="${GHC_FLAVOUR}" SKIP_GHC= sh; \
    . /root/.ghc-wasm/env; \
    wasm32-wasi-ghc --version; \
    wasm32-wasi-ghc --numeric-version

FROM toolchain AS builder
WORKDIR /src

RUN . /root/.ghc-wasm/env; \
    GHC_NUM="$(wasm32-wasi-ghc --numeric-version)"; \
    echo "resolved GHC wasm32-wasi version: ${GHC_NUM}"; \
    echo "${GHC_NUM}" > /src/GHC_VERSION

ARG PANDOC_REPO=https://github.com/haskell-wasm/pandoc.git
ARG PANDOC_COMMIT=336228bb8d5e9bf35750cfe6b546ffb4bcd86c15
ARG PANDOC_VERSION=3.5
ENV PANDOC_VERSION=${PANDOC_VERSION}
RUN set -eux; \
    git init pandoc; \
    cd pandoc; \
    git remote add origin "${PANDOC_REPO}"; \
    git fetch --depth 1 origin "${PANDOC_COMMIT}"; \
    git checkout FETCH_HEAD; \
    grep -E '^version:' pandoc.cabal; \
    echo "${PANDOC_VERSION}" > /src/PANDOC_VERSION

RUN set -eux; \
    . /root/.ghc-wasm/env; \
    cd pandoc; \
    wasm32-wasi-cabal update; \
    wasm32-wasi-cabal build pandoc-cli; \
    PANDOC_WASM="$(find dist-newstyle -type f -name pandoc.wasm | head -1)"; \
    [ -n "$PANDOC_WASM" ] || { echo "pandoc.wasm not produced" >&2; exit 1; }; \
    echo "raw: $PANDOC_WASM"; ls -lh "$PANDOC_WASM"; \
    mkdir -p /build; \
    cp "$PANDOC_WASM" /build/pandoc.raw.wasm

RUN set -eux; \
    . /root/.ghc-wasm/env; \
    if command -v wasm-opt >/dev/null 2>&1; then \
      wasm-opt --low-memory-unused --converge --gufa --flatten --rereloop -Oz \
        /build/pandoc.raw.wasm -o /build/pandoc.wasm; \
    else \
      echo "wasm-opt not found; shipping unoptimized module" >&2; \
      cp /build/pandoc.raw.wasm /build/pandoc.wasm; \
    fi; \
    ls -lh /build/pandoc.wasm

RUN set -eux; \
    [ "$(head -c4 /build/pandoc.wasm | od -An -tx1 | tr -d ' \n')" = "0061736d" ]; \
    [ "$(stat -c%s /build/pandoc.wasm)" -gt 1048576 ]

RUN set -eux; \
    S=/smoke; mkdir -p "$S"; \
    printf '# Title\n\nHello *wasm* with a [link](https://example.com).\n\n- one\n- two\n' > "$S/in.md"; \
    OUT="$(wasmtime run --dir "$S::/work" /build/pandoc.wasm /work/in.md -f markdown -t html)"; \
    echo "html: [$OUT]"; \
    case "$OUT" in *"<h1"*"Title"*"<em>wasm</em>"*) : ;; *) echo "html conversion wrong" >&2; exit 1 ;; esac; \
    wasmtime run --dir "$S::/work" /build/pandoc.wasm /work/in.md -f markdown -t rst -o /work/out.rst; \
    grep -q "Title" "$S/out.rst"; \
    echo "rst file:"; head -5 "$S/out.rst"; \
    OUT="$(wasmtime run /build/pandoc.wasm --version)"; \
    echo "version: [$OUT]"; case "$OUT" in pandoc*) : ;; *) echo "bad --version" >&2; exit 1 ;; esac

COPY js  ./js
RUN set -eux; \
    mkdir -p /dist; \
    cp /build/pandoc.wasm   /dist/pandoc.wasm; \
    cp js/pandoc.mjs        /dist/pandoc.mjs; \
    cp /src/PANDOC_VERSION  /dist/PANDOC_VERSION; \
    cp /src/GHC_VERSION     /dist/GHC_VERSION; \
    [ "$(head -c4 /dist/pandoc.wasm | od -An -tx1 | tr -d ' \n')" = "0061736d" ] || { echo "bad magic" >&2; exit 1; }; \
    [ "$(stat -c%s /dist/pandoc.wasm)" -gt 1048576 ] || { echo "too small" >&2; exit 1; }; \
    echo "=== dist ==="; ls -lh /dist

FROM scratch AS exportor
COPY --from=builder /dist /dist
