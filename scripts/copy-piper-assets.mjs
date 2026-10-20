import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public");
const ortSource = path.join(projectRoot, "node_modules", "onnxruntime-web", "dist");
const phonemizerSource = path.join(projectRoot, "node_modules", "@diffusionstudio", "piper-wasm", "build");
const ortTarget = path.join(publicRoot, "vendor", "ort");
const phonemizerTarget = path.join(publicRoot, "vendor", "phonemize");

async function assertFile(filePath) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
  } catch {
    throw new Error(`Required Piper runtime asset was not found: ${filePath}\nTry deleting node_modules and running npm install again.`);
  }
}

await mkdir(ortTarget, { recursive: true });
await mkdir(phonemizerTarget, { recursive: true });

const ortFiles = await readdir(ortSource);
const requiredOrtFiles = ["ort.wasm.min.js", ...ortFiles.filter((file) => /^ort-wasm(?!.*\.jsep\.).*\.wasm$/.test(file))];
for (const file of new Set(requiredOrtFiles)) {
  const source = path.join(ortSource, file);
  await assertFile(source);
  await copyFile(source, path.join(ortTarget, file));
}

for (const file of ["piper_phonemize.js", "piper_phonemize.data", "piper_phonemize.wasm"]) {
  const source = path.join(phonemizerSource, file);
  await assertFile(source);
  await copyFile(source, path.join(phonemizerTarget, file));
}

console.log("CareMate Piper voice assets copied into public/vendor.");
