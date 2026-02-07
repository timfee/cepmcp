/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prints the full transitive dependency tree for one or more npm packages
 * by walking node_modules. Used during release to understand which packages
 * must be bundled alongside the server.
 */

import * as path from "node:path";

import { getTransitiveDependencies } from "./utils/dependencies";


const root = path.join(__dirname, "..");
const targetPackages = process.argv.slice(2);

if (targetPackages.length === 0) {
  console.log("Usage: node scripts/list-deps.ts <package1> [package2...]");
  process.exit(1);
}

console.log(`Analyzing dependencies for: ${targetPackages.join(", ")}`);

const allDeps = getTransitiveDependencies(root, targetPackages);

console.log("\\nTransitive Dependencies:");
for (const dep of Array.from(allDeps).toSorted()) {
  console.log(`- ${dep}`);
}
