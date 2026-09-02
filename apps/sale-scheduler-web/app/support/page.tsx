import { PublicDocument } from "../../components/public-layout";

export const metadata = { title: "サポート | Sale Scheduler" };
export const dynamic = "force-dynamic";

export default function SupportPage() {
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();
  const supportUrl = process.env.SUPPORT_URL?.trim();
  return <PublicDocument eyebrow="Support" title="サポート" lead="操作方法、処理結果、価格変更のConflictについてご案内します。">
    <section className="doc-section"><h2>お問い合わせ</h2><div className="contact-card"><div><strong>メール</strong>{supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : <span className="placeholder">公開前に設定してください</span>}</div><div><strong>サポートURL</strong>{supportUrl ? <a href={supportUrl}>{supportUrl}</a> : <span className="placeholder">公開前に設定してください</span>}</div></div></section>
    <section className="doc-section"><h2>お問い合わせ時にお知らせください</h2><ul><li>ショップのAccount ID</li><li>予約の開始・終了日時</li><li>対象商品の商品ID</li><li>表示された状態（失敗、Conflict、確認不能など）</li><li>発生日時とrequest ID（画面に表示される場合）</li></ul><p>アクセストークン、Client Secret、暗号鍵などの秘密情報は送らないでください。</p></section>
    <section className="doc-section"><h2>よくある確認</h2><h3>全商品が同時に変わりません</h3><p>API制限により、指定した開始日時から商品ごとに順次処理します。Previewの概算時間を確認してください。</p><h3>Conflictになりました</h3><p>終了直前の価格がセール価格と違っていたため、自動復元を止めています。管理画面で現在価格と意図した価格を確認してください。</p><h3>確認不能になりました</h3><p>書き込み後の確認GETで期待価格を確定できなかった状態です。追加の価格変更は行っていません。外部管理画面で商品価格を確認してください。</p></section>
    <section className="doc-section"><div className="public-callout">サポート連絡先は公開前に必ず設定します。未設定のままではApp Store審査へ提出しません。</div></section>
  </PublicDocument>;
}
