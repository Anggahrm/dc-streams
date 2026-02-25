import { access, readdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const removableDirs = [
  "node_modules/zeromq/build/darwin",
  "node_modules/zeromq/build/win32"
];

const mapRoots = [
  "dist",
  "vendor/discord-video-stream/dist",
  "node_modules/zeromq/build"
];

async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(targetPath) {
  if (!(await pathExists(targetPath))) return false;
  await rm(targetPath, { recursive: true, force: true });
  return true;
}

async function removeMaps(rootPath) {
  if (!(await pathExists(rootPath))) return 0;

  let removed = 0;
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      removed += await removeMaps(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".map")) {
      await rm(fullPath, { force: true });
      removed += 1;
    }
  }

  return removed;
}

async function run() {
  let removedDirs = 0;
  for (const target of removableDirs) {
    if (await removeIfExists(target)) removedDirs += 1;
  }

  let removedMaps = 0;
  for (const root of mapRoots) {
    removedMaps += await removeMaps(root);
  }

  console.log(`[heroku-prune] removed dirs=${removedDirs}, sourcemaps=${removedMaps}`);
}

run().catch((error) => {
  console.error("[heroku-prune] failed", error);
  process.exitCode = 1;
});
