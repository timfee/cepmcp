/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dependency graph traversal utilities for the release packaging pipeline.
 * Walks node_modules to compute the full transitive closure of dependencies
 * for a given set of root packages.
 */

import * as fs from "node:fs";
import * as path from "node:path";


/**
 * Minimal package.json shape needed for dependency resolution.
 */
interface PackageJson {
  dependencies?: Record<string, string>;
}


/**
 * Reads a package's direct dependencies from its package.json in node_modules.
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
 * Recursively resolves all transitive dependencies starting from a list of
 * root packages, returning the complete set including the roots themselves.
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
