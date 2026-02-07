/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface PackageJson {
  dependencies?: Record<string, string>;
}

/**
 * Gets the direct dependencies of a package from its package.json.
 * @param rootDir - The root directory containing node_modules.
 * @param pkgName - The name of the package.
 * @returns - A list of dependency names.
 */
function getDependencies(rootDir: string, pkgName: string): string[] {
  const pkgPath = path.join(rootDir, "node_modules", pkgName, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return [];
  }
  const fileContent = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(fileContent) as PackageJson;
  return Object.keys(pkg.dependencies || {});
}

/**
 * Recursively finds all transitive dependencies for a list of packages.
 * @param rootDir - The root directory containing node_modules.
 * @param startPkgs - The list of initial packages to resolve.
 * @returns - A set of all transitive dependencies (including startPkgs).
 */
export function getTransitiveDependencies(
  rootDir: string,
  startPkgs: string[]
): Set<string> {
  const visited = new Set<string>();
  const toVisit = [...startPkgs];

  while (toVisit.length > 0) {
    const pkg = toVisit.pop();
    if (pkg && !visited.has(pkg)) {
      visited.add(pkg);

      const deps = getDependencies(rootDir, pkg);
      for (const dep of deps) {
        if (!visited.has(dep)) {
          toVisit.push(dep);
        }
      }
    }
  }

  return visited;
}
