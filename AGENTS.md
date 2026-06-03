Default to using Bun instead of Node.js. Bun has many APIs. You might not need alternatives.
Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

it("behaves like so", () => {
  expect(1).toBe(1);
});
```

Bun supports YML as first citizen

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
