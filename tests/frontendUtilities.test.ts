import { assertEquals } from "@std/assert";
import { createApiUrl } from "../frontend/src/lib/api-url.ts";
import { parseTests } from "../frontend/src/lib/order-tests.ts";

Deno.test("dashboard API URLs support the default same-origin setting and configured prefixes", () => {
  const origin = "http://127.0.0.1:15181";
  assertEquals(createApiUrl("/info", "", origin).href, `${origin}/info`);
  assertEquals(createApiUrl("/orders", "/", origin).href, `${origin}/orders`);
  assertEquals(
    createApiUrl("/orders", "/api/", origin).href,
    `${origin}/api/orders`,
  );
  assertEquals(
    createApiUrl("/orders", "https://agent.example/api/", origin).href,
    "https://agent.example/api/orders",
  );
  const url = createApiUrl("/orders", "", origin);
  url.searchParams.set("sampleId", "sample / 1");
  assertEquals(url.searchParams.get("sampleId"), "sample / 1");
});

Deno.test("order test parsing retains instrument code zero and removes only blanks and duplicates", () => {
  assertEquals(parseTests("0, FT4_1, 0, , 001, TSH "), [
    "0",
    "FT4_1",
    "001",
    "TSH",
  ]);
  assertEquals(parseTests(" ,  "), []);
});

Deno.test("dashboard headers resolve section and detail routes", async () => {
  const { getPageMeta } = await import("../frontend/src/lib/page-meta.ts");
  assertEquals(getPageMeta("/dashboard/").title, "Laboratory operations");
  assertEquals(getPageMeta("/dashboard/orders").title, "Test orders");
  assertEquals(getPageMeta("/dashboard/orders/12").title, "Test orders");
  assertEquals(getPageMeta("/dashboard/profiles/7").title, "Analyzer profiles");
  assertEquals(
    getPageMeta("/dashboard/master-connection").title,
    "Master connection",
  );
});
