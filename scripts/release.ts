/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builds a distributable tar.gz release archive containing the bundled server,
 * native node_modules (keytar, jsdom), extension manifest, context file, and
 * commands directory. Accepts an optional --platform flag for platform-specific
 * archive naming.
 */

import archiver from "archiver";
import minimist from "minimist";
import * as fs from "node:fs";
import * as path from "node:path";

import packageJson from "../package.json";
import { getTransitiveDependencies } from "./utils/dependencies";


const argv = minimist(process.argv.slice(2));


/**
 * Recursively deletes all files with a given extension inside a directory.
 */
const deleteFilesByExtension = (dir: string, ext: string) => {
  if (!fs.existsSync(dir)) {
    return;
  }

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.lstatSync(filePath);
    if (stat.isDirectory()) {
      deleteFilesByExtension(filePath, ext);
    } else if (filePath.endsWith(ext)) {
      fs.unlinkSync(filePath);
    }
  }
};


/**
 * Assembles a release archive from the built dist, native dependencies,
 * extension manifest, and supporting files.
 */
const main = async () => {
  const platform = argv.platform;
  if (platform && typeof platform !== "string") {
    console.error(
      "[release] --platform argument must be a string (e.g., --platform=linux)"
    );
    process.exit(1);
  }
  const baseName = "google-cep-extension";
  const name = platform ? `${platform}.${baseName}` : baseName;
  const extension = "tar.gz";

  const rootDir = path.join(__dirname, "..");
  const releaseDir = path.join(rootDir, "release");
  fs.rmSync(releaseDir, { recursive: true, force: true });
  const archiveName = `${name}.${extension}`;
  const archiveDir = path.join(releaseDir, name);
  const workspaceMcpServerDir = path.join(rootDir, "workspace-server");

  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(archiveDir, { recursive: true });

  // Copy and clean the dist directory
  fs.cpSync(
    path.join(workspaceMcpServerDir, "dist"),
    path.join(archiveDir, "dist"),
    { recursive: true }
  );

  const distDir = path.join(archiveDir, "dist");
  deleteFilesByExtension(distDir, ".d.ts");
  deleteFilesByExtension(distDir, ".map");
  fs.rmSync(path.join(distDir, "__tests__"), { recursive: true, force: true });
  fs.rmSync(path.join(distDir, "auth"), { recursive: true, force: true });
  fs.rmSync(path.join(distDir, "services"), { recursive: true, force: true });
  fs.rmSync(path.join(distDir, "utils"), { recursive: true, force: true });

  // Copy native modules and their transitive dependencies
  const nodeModulesDir = path.join(archiveDir, "node_modules");
  fs.mkdirSync(nodeModulesDir, { recursive: true });

  const visited = getTransitiveDependencies(rootDir, ["keytar", "jsdom"]);

  for (const pkg of visited) {
    const source = path.join(rootDir, "node_modules", pkg);
    const dest = path.join(nodeModulesDir, pkg);
    if (fs.existsSync(source)) {
      fs.cpSync(source, dest, { recursive: true });
    }
  }

  const version = (process.env.GITHUB_REF_NAME || packageJson.version).replace(
    /^v/,
    ""
  );

  // Generate the gemini-extension.json manifest
  const geminiExtensionJson = {
    name: "google-cep",
    version,
    contextFileName: "WORKSPACE-Context.md",
    mcpServers: {
      "google-cep": {
        command: "node",
        args: ["dist/index.js", "--use-dot-names"],
        cwd: "${extensionPath}",
      },
    },
  };
  fs.writeFileSync(
    path.join(archiveDir, "gemini-extension.json"),
    JSON.stringify(geminiExtensionJson, null, 2)
  );

  fs.copyFileSync(
    path.join(workspaceMcpServerDir, "WORKSPACE-Context.md"),
    path.join(archiveDir, "WORKSPACE-Context.md")
  );

  const commandsDir = path.join(rootDir, "commands");
  if (fs.existsSync(commandsDir)) {
    fs.cpSync(commandsDir, path.join(archiveDir, "commands"), {
      recursive: true,
    });
  }

  // Create the gzipped tar archive
  const output = fs.createWriteStream(path.join(releaseDir, archiveName));
  const archive = archiver("tar", {
    gzip: true,
  });

  const archivePromise = new Promise<void>((resolve, reject) => {
    output.on("close", () => {
      console.log(`[release] ✓ archive complete (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });
  });

  archive.pipe(output);
  archive.directory(archiveDir, false);
  await archive.finalize();

  await archivePromise;
};


main().catch((err) => {
  console.error("[release] ✗", err);
  process.exit(1);
});
