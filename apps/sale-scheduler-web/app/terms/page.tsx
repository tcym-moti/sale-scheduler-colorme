import { PublicDocument } from "../../components/public-layout";

export const metadata = { title: "利用規約 | Sale Scheduler" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const operatorName = process.env.OPERATOR_NAME?.trim() || "公開前に設定してください";
  return <PublicDocument eyebrow="Terms" title="利用規約" lead="Sale Scheduler for カラーミーショップの利用条件です。公開前に運営者情報と正式な連絡先を確認してください。">
    <section className="doc-section"><h2>第1条（適用）</h2><p>本規約は、{operatorName}（以下「運営者」）が提供するSale Scheduler（以下「本サービス」）の利用条件を定めるものです。</p></section>
    <section className="doc-section"><h2>第2条（本サービス）</h2><p>本サービスは、利用者が選択したカラーミーショップの商品について、販売価格の変更を指定日時から順次実行し、条件を満たす場合に変更前の価格へ復元する機能を提供します。バリエーション商品など、マニュアルに記載する対象外機能は利用できません。</p></section>
    <section className="doc-section"><h2>第3条（利用者の責任）</h2><p>利用者は、価格、対象商品、開始・終了日時を確認して予約するものとします。Previewに表示される概算処理時間は保証値ではありません。手動変更や外部APIの障害により、処理が遅延、停止、またはConflictになる場合があります。</p></section>
    <section className="doc-section"><h2>第4条（禁止事項）</h2><p>法令またはカラーミーショップの規約に違反する利用、第三者への不正アクセス、サービス運営を妨害する行為、その他運営者が不適切と判断する行為を禁止します。</p></section>
    <section className="doc-section"><h2>第5条（免責）</h2><p>運営者は、外部API、通信、クラウド基盤その他運営者の合理的な管理を超える事由による遅延や停止について、法令上許される範囲で責任を負いません。価格変更前に必ずPreviewと履歴を確認してください。</p></section>
    <section className="doc-section"><h2>第6条（変更・終了）</h2><p>運営者は、必要に応じて本サービスの内容または本規約を変更し、または提供を終了できます。重要な変更は適切な方法で告知します。</p></section>
    <section className="doc-section"><h2>運営者情報</h2><p className="placeholder">{operatorName}</p><p>正式な運営者名、所在地、料金、解約方法、問い合わせ先はApp Store公開前に設定します。</p></section>
  </PublicDocument>;
}
