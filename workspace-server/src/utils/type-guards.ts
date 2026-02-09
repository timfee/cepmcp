/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TypeScript type guard utilities for narrowing unknown values to
 * Node.js-specific types like ErrnoException and AddressInfo.
 */

import type { AddressInfo } from "node:net";


/**
 * Narrows an unknown error to NodeJS.ErrnoException by checking for
 * characteristic properties (errno, code, path, syscall).
 */
export function isErrnoException(
  error: unknown
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    ("errno" in error ||
      "code" in error ||
      "path" in error ||
      "syscall" in error)
  );
}


/**
 * Narrows an unknown value to a net.AddressInfo by checking for the
 * required port, family, and address properties.
 */
export function isAddressInfo(address: unknown): address is AddressInfo {
  return (
    typeof address === "object" &&
    address !== null &&
    "port" in address &&
    "family" in address &&
    "address" in address
  );
}
