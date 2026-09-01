import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

export interface FakeProduct {
  id: number;
  name: string;
  sales_price: number;
  price?: number;
  variants?: unknown[];
}

export interface FakeCall {
  method: string;
  path: string;
  body: unknown;
}

export class FakeColormeApi {
  private readonly products = new Map<number, FakeProduct>();
  private readonly failures: Array<{ method: string; path: RegExp; status: number }> = [];
  private readonly delayedWriteReads = new Map<number, number[][]>();
  private readonly pendingReadSequence = new Map<number, number[]>();
  readonly calls: FakeCall[] = [];
  private readonly server = createServer((request, response) => { void this.handle(request, response); });

  constructor(products: FakeProduct[] = [{ id: 1, name: "Fake Tシャツ", sales_price: 1000, price: 1000 }]) {
    for (const product of products) this.products.set(product.id, { variants: [], ...product });
  }

  async start(): Promise<string> {
    this.server.listen(0, "127.0.0.1");
    await once(this.server, "listening");
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("fake API did not start");
    return `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    this.server.close();
    await once(this.server, "close");
  }

  setPrice(productId: number, price: number): void {
    const product = this.products.get(productId);
    if (!product) throw new Error(`unknown fake product ${productId}`);
    product.sales_price = price;
  }

  failNext(method: string, path: RegExp, status: number): void {
    this.failures.push({ method, path, status });
  }

  /** Queue observed GET prices for the next PUT on a product. */
  delayNextWriteVerification(productId: number, observedPrices: number[]): void {
    const queued = this.delayedWriteReads.get(productId) ?? [];
    queued.push([...observedPrices]);
    this.delayedWriteReads.set(productId, queued);
  }

  product(productId: number): FakeProduct | undefined {
    const product = this.products.get(productId);
    return product ? { ...product, variants: [...(product.variants ?? [])] } : undefined;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://fake.local");
    const path = url.pathname;
    const method = request.method ?? "GET";
    const bodyText = await this.readBody(request);
    let body: unknown = null;
    if (bodyText) {
      try { body = JSON.parse(bodyText); } catch { body = null; }
    }
    this.calls.push({ method, path, body });
    const failureIndex = this.failures.findIndex((failure) => failure.method === method && failure.path.test(path));
    if (failureIndex >= 0) {
      const failure = this.failures.splice(failureIndex, 1)[0];
      this.send(response, failure.status, { errors: [{ code: `FAKE_${failure.status}`, message: "fake transient failure", status: failure.status }] });
      return;
    }
    const match = path.match(/^\/v1\/products\/(\d+)$/);
    if (!match) { this.send(response, 404, { errors: [{ code: "NOT_FOUND", message: "not found", status: 404 }] }); return; }
    const productId = Number(match[1]);
    const product = this.products.get(productId);
    if (!product) { this.send(response, 404, { errors: [{ code: "NOT_FOUND", message: "not found", status: 404 }] }); return; }
    if (method === "GET") {
      const sequence = this.pendingReadSequence.get(productId);
      if (sequence?.length) {
        const observedPrice = sequence.shift() as number;
        if (!sequence.length) this.pendingReadSequence.delete(productId);
        this.send(response, 200, { product: { ...product, sales_price: observedPrice } });
        return;
      }
      this.send(response, 200, { product });
      return;
    }
    if (method === "PUT") {
      const salesPrice = (body as { product?: { sales_price?: unknown } } | null)?.product?.sales_price;
      if (!Number.isSafeInteger(salesPrice)) { this.send(response, 422, { errors: [{ code: "INVALID", message: "invalid price", status: 422 }] }); return; }
      const delayedReads = this.delayedWriteReads.get(productId);
      if (delayedReads?.length) {
        const sequence = delayedReads.shift() as number[];
        this.pendingReadSequence.set(productId, sequence);
        if (!delayedReads.length) this.delayedWriteReads.delete(productId);
      }
      product.sales_price = salesPrice as number;
      this.send(response, 200, { product });
      return;
    }
    this.send(response, 405, { errors: [{ code: "METHOD", message: "method not allowed", status: 405 }] });
  }

  private readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let value = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => { value += chunk; });
      request.on("end", () => resolve(value));
      request.on("error", reject);
    });
  }

  private send(response: ServerResponse, status: number, value: unknown): void {
    response.statusCode = status;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(value));
  }
}
