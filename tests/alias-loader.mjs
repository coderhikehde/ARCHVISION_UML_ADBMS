import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, readFileSync, statSync } from "node:fs";
import { transpileModule, ModuleKind, ModuleDetectionKind, ScriptTarget } from "typescript";

const root = pathToFileURL(process.cwd() + "/").href;

/**
 * TypeScript loader for `node --test`:
 *
 *  - resolve: maps `@/` aliases to project files, and resolves
 *    extensionless relative imports (legal TS, not legal node ESM).
 *  - load: transpiles .ts sources with the TypeScript compiler before
 *    node parses them. We cannot rely on node's built-in strip-only mode
 *    — its CJS/ESM detection for typeless packages is unreliable for
 *    TypeScript (it misdetects valid ESM files as CommonJS, which then
 *    fails on `export`), and strip-only rejects parameter properties.
 *
 * Production code is never loaded through this file — it only exists for
 * the test harness (tests/package scripts use it via --experimental-loader).
 */

function sep() {
  return process.platform === "win32" ? "\\" : "/";
}

function transpile(url) {
  const path = fileURLToPath(url);
  const source = readFileSync(path, "utf8");
  const isInsideNodeModules = path.includes(`${sep()}node_modules${sep()}`) || path.includes("/node_modules/");
  if (isInsideNodeModules) {
    // Vendored TS (e.g. the generated Prisma client) is plain module code
    // — pass it through untouched to keep test startup fast.
    return source;
  }
  const out = transpileModule(source, {
    fileName: path,
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
      moduleDetection: ModuleDetectionKind.Force,
    },
  });
  return out.outputText;
}

export async function load(url, context, next) {
  if (typeof url === "string" && url.startsWith("file:") && /\.(ts|tsx|mts|cts)$/i.test(url)) {
    const source = transpile(url);
    return {
      format: "module",
      shortCircuit: true,
      source,
    };
  }
  return next(url, context);
}

export async function resolve(specifier, context, next) {
  if (typeof specifier === "string" && specifier.startsWith("@/")) {
    const bare = specifier.slice(2);
    for (const candidate of [bare, `${bare}.ts`, `${bare}.tsx`, `${bare}/index.ts`, `${bare}/index.tsx`]) {
      const url = new URL(candidate, root);
      const path = fileURLToPath(url);
      if (existsSync(path) && statSync(path).isFile()) {
        return { url: url.href, shortCircuit: true };
      }
    }
    throw new Error(`Alias loader: cannot resolve "${specifier}"`);
  }
  // Extensionless relative imports ("../foo") are legal TypeScript but
  // not node ESM — resolve them against the importing module.
  if (
    typeof specifier === "string" &&
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.(ts|tsx|js|mjs|cjs|json)$/i.test(specifier) &&
    context.parentURL
  ) {
    for (const candidate of [specifier, `${specifier}.ts`, `${specifier}.tsx`]) {
      const url = new URL(candidate, context.parentURL);
      const path = fileURLToPath(url);
      if (existsSync(path) && statSync(path).isFile()) {
        return { url: url.href, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}