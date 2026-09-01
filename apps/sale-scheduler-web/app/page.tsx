import { currentShop } from "../lib/server";
import Dashboard from "../components/dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const shop = await currentShop();
  if (!shop) {
    return <main className="landing"><section className="card landing-card"><div className="brand-mark" style={{ margin: "0 auto" }}>SS</div><h1>Sale Scheduler</h1><p>カラーミーショップのセール価格変更と、終了後の安全な元価格復元を予約できます。</p><a className="button primary" href="/auth/colorme">カラーミーショップでログイン</a><p className="footer-note">MVPはバリエーションなし商品に対応しています。</p></section></main>;
  }
  return <Dashboard shopName={shop.shopName} accountId={shop.accountId} />;
}
