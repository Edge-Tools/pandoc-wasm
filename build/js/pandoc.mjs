





















import { WASI } from 'node:wasi';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default async function Module(opts = {}) {
  const wasmBinary = opts.wasmBinary ?? fs.readFileSync(path.join(here, 'pandoc.wasm'));
  const print = opts.print ?? null;
  const printErr = opts.printErr ?? null;

  const compiled = await WebAssembly.compile(wasmBinary);

  
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pandoc-wasm-'));
  fs.mkdirSync(path.join(scratch, 'work'), { recursive: true });

  const guestToHost = (p) => path.join(scratch, p.replace(/^\/+/, ''));

  const FS = {
    writeFile(p, data) {
      const host = guestToHost(p);
      fs.mkdirSync(path.dirname(host), { recursive: true });
      fs.writeFileSync(host, data);
    },
    readFile(p) { return fs.readFileSync(guestToHost(p)); },
    exists(p) { return fs.existsSync(guestToHost(p)); },
    unlink(p) { try { fs.unlinkSync(guestToHost(p)); } catch { /* ignore */ } },
    scratch,
  };

  // Run the command module fresh under WASI; capture stdout/stderr + exit code.
  // argv[0] is conventional ('pandoc'); WASI exposes argv[1..] as args. An
  
  async function run(args = [], runOpts = {}) {
    const outPath = path.join(scratch, '.stdout');
    const errPath = path.join(scratch, '.stderr');
    const outFd = fs.openSync(outPath, 'w');
    const errFd = fs.openSync(errPath, 'w');
    let inFd;
    if (runOpts.stdin != null) {
      const inPath = path.join(scratch, '.stdin');
      fs.writeFileSync(inPath, runOpts.stdin);
      inFd = fs.openSync(inPath, 'r');
    }
    let code;
    try {
      const wasi = new WASI({
        version: 'preview1',
        args: ['pandoc', ...args],
        env: runOpts.env ?? {},
        preopens: { '/': scratch },
        ...(inFd != null ? { stdin: inFd } : {}),
        stdout: outFd,
        stderr: errFd,
        returnOnExit: true,
      });
      const instance = await WebAssembly.instantiate(compiled, wasi.getImportObject());
      code = wasi.start(instance);
    } finally {
      
      
      
      for (const fd of [outFd, errFd, inFd]) {
        if (fd != null) {
          try { fs.closeSync(fd); } catch {  }
        }
      }
    }
    const stdout = fs.readFileSync(outPath, 'utf8');
    const stderr = fs.readFileSync(errPath, 'utf8');
    const emit = (cb, text) => {
      if (!cb || !text) return;
      const lines = text.split('\n');
      if (lines.at(-1) === '') lines.pop();
      for (const l of lines) cb(l);
    };
    emit(print, stdout);
    emit(printErr, stderr);
    return { code, stdout, stderr };
  }

  
  const callMain = (args, runOpts) => run(args, runOpts);

  return { run, callMain, FS };
}
