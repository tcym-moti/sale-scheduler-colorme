import { NextResponse } from "next/server";
import { requestIdFrom, jsonError, jsonOk } from "../../../../lib/http";
import { clientForShop, requireShop } from "../../../../lib/server";

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  try {
    const shop = await requireShop();
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const { client, limiter } = await clientForShop(shop);
    const products = query
      ? await client.searchProducts(query, { beforeRequest: () => limiter.acquire(shop.id) })
      : await client.listProducts({ limit: 50 }, { beforeRequest: () => limiter.acquire(shop.id) });
    return jsonOk({ products }, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
