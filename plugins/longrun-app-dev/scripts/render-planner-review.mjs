import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SchemaValidator } from "../runtime/dist/artifacts/index.js";
import { renderProductSpecMarkdown, validateProductSpecReferences } from "../runtime/dist/planner/index.js";

// Offline review of the maintained fixture, not evidence of a live model run.
const source = new URL("../tests/fixtures/planner-valid-spec.json", import.meta.url);
const target = new URL("../../../docs/reviews/m5-planner/", import.meta.url);
const spec = await new SchemaValidator().validate("product-spec", JSON.parse(await readFile(source, "utf8")));
const errors = validateProductSpecReferences(spec);
if (errors.length) throw new Error(errors.join("\n"));
await mkdir(target, { recursive: true });
await writeFile(new URL("fixture-product-spec.md", target),
  "> Source: maintained test fixture. This is not live model output.\n\n" + renderProductSpecMarkdown(spec));
console.log("Validated fixture and rendered docs/reviews/m5-planner/fixture-product-spec.md");
