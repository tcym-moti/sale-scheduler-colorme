import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sale Scheduler | カラーミーショップ",
  description: "セール価格への変更と安全な元価格復元を予約するアプリ"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
