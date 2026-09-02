import Link from "next/link";

export function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="public-shell">
    <header className="public-header">
      <Link className="public-brand" href="/"><span className="brand-mark">SS</span><span>Sale Scheduler</span></Link>
      <nav className="public-nav" aria-label="公開ページ">
        <Link href="/manual">使い方</Link>
        <Link href="/support">サポート</Link>
        <Link className="button small" href="/app">アプリを開く</Link>
      </nav>
    </header>
    {children}
    <footer className="public-footer">
      <span>Sale Scheduler for カラーミーショップ</span>
      <nav aria-label="フッター">
        <Link href="/manual">使い方</Link>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy">プライバシー</Link>
        <Link href="/support">サポート</Link>
      </nav>
    </footer>
  </div>;
}

export function PublicDocument({ eyebrow, title, lead, children }: Readonly<{ eyebrow: string; title: string; lead: string; children: React.ReactNode }>) {
  return <PublicLayout><main className="public-main"><header className="doc-header"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{lead}</p></header><article className="public-section">{children}</article></main></PublicLayout>;
}
