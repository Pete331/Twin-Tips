// Runs before every component test file.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only unmounts automatically when it can see a global
// afterEach at import time, which depends on how the runner is configured.
// Doing it here means it happens either way - and without it a component from
// the previous test is still in the document, so a query that should find one
// checkbox finds two and the failure points at the wrong test.
afterEach(cleanup);
