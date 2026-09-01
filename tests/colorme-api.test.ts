import { afterEach, describe, expect, it } from "vitest";
import { ColormeClient } from "@sale-scheduler/colorme-api";
import { FakeColormeApi } from "./fake-colorme";

let fake: FakeColormeApi | undefined;

afterEach(async () => { if (fake) await fake.close(); fake = undefined; });

describe("ColorMe API client", () => {
  it("uses the product price endpoint and sales_price request body", async () => {
    fake = new FakeColormeApi([{ id: 10, name: "検証商品", sales_price: 1000, price: 1200 }]);
    const baseUrl = await fake.start();
    const client = new ColormeClient("fake-token", { baseUrl });
    const before = await client.getProduct(10);
    expect(before.salesPrice).toBe(1000);
    const changed = await client.updateProductPrice(10, 1100);
    expect(changed.salesPrice).toBe(1100);
    expect(fake.calls.find((call) => call.method === "PUT")?.body).toEqual({ product: { sales_price: 1100 } });
    expect(fake.calls.find((call) => call.method === "PUT")?.path).toBe("/v1/products/10");
  });
  it("maps variants so the application can reject them", async () => {
    fake = new FakeColormeApi([{ id: 11, name: "バリエーション商品", sales_price: 1500, variants: [{ id: 1 }] }]);
    const baseUrl = await fake.start();
    const product = await new ColormeClient("fake-token", { baseUrl }).getProduct(11);
    expect(product.variantCount).toBe(1);
  });
});
