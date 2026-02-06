/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AddressInfo } from "node:net";

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

export function isAddressInfo(address: unknown): address is AddressInfo {
  return (
    typeof address === "object" &&
    address !== null &&
    "port" in address &&
    "family" in address &&
    "address" in address
  );
}
