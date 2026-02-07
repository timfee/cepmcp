/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Synchronizes the version field across root and workspace-server package.json
 * files. When called with a version argument it updates both files; without an
 * argument it reads the root version and propagates it to workspace-server.
 */

import * as fs from "node:fs";
import * as path from "node:path";


const rootDir = path.join(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const workspaceServerPackageJsonPath = path.join(
  rootDir,
  "workspace-server",
  "package.json"
);


/**
 * Shape of a package.json file with at least a version field.
 */
interface VersionedJson {
  version: string;
  [key: string]: unknown;
}


/**
 * Reads a JSON file, sets its version field, and writes it back.
 */
const updateJsonFile = (filePath: string, version: string) => {
  try {
    const content = JSON.parse(
      fs.readFileSync(filePath, "utf8")
    ) as VersionedJson;
    content.version = version;
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + "\\n");
    console.log(
      `[set-version] ✓ ${path.relative(rootDir, filePath)} -> ${version}`
    );
  } catch (error) {
    console.error(
      `[set-version] ✗ failed to update ${path.relative(rootDir, filePath)}:`,
      error
    );
    process.exit(1);
  }
};


const main = () => {
  let version = process.argv[2];

  if (version) {
    updateJsonFile(packageJsonPath, version);
  } else {
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf8")
    ) as VersionedJson;
    version = packageJson.version;
    console.log(`[set-version] using version from package.json: ${version}`);
  }

  if (!version) {
    console.error("[set-version] ✗ no version specified and none found in package.json");
    process.exit(1);
  }

  updateJsonFile(workspaceServerPackageJsonPath, version);
};


main();
