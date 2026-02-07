/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Drop-in replacement for the 'open' npm package, aliased at build time.
 * Routes browser launch requests through our secure-browser-launcher and
 * prints the URL to console as a fallback when the browser cannot be opened.
 */

import {
  openBrowserSecurely,
  shouldLaunchBrowser,
} from "./secure-browser-launcher";


/**
 * Returns a stub ChildProcess-like object so callers that expect the 'open'
 * package's return type continue to work without modification.
 */
const createMockChildProcess = () => ({
  unref: () => {
    // Mock
  },
  ref: () => {
    // Mock
  },
  pid: 123,
  stdout: null,
  stderr: null,
  stdin: null,
  channel: null,
  connected: false,
  exitCode: 0,
  killed: false,
  signalCode: null,
  spawnargs: [],
  spawnfile: "",
});


/**
 * Attempts to open a URL securely in the default browser. If the environment
 * does not support browser launch or the launch fails, prints the URL to
 * console instead and returns a mock child process for API compatibility.
 */
const openWrapper = async (url: string): Promise<unknown> => {
  if (!shouldLaunchBrowser()) {
    console.log(
      `[cep] browser launch not supported, open this URL manually: ${url}`
    );
    return createMockChildProcess();
  }

  try {
    await openBrowserSecurely(url);
    return createMockChildProcess();
  } catch {
    console.log(
      `[cep] failed to open browser, open this URL manually: ${url}`
    );
    return createMockChildProcess();
  }
};


export default openWrapper;
