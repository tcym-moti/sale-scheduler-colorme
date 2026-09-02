import { currentShop } from "../../lib/server";
import Dashboard from "../../components/dashboard";
import LandingPage from "../../components/landing";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const shop = await currentShop();
  return shop ? <Dashboard shopName={shop.shopName} accountId={shop.accountId} /> : <LandingPage />;
}
