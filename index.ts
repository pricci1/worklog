import { cli } from "./src/cli";

if (import.meta.main) {
  process.exitCode = await cli();
}
