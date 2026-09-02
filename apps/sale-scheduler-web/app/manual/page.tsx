import { PublicDocument } from "../../components/public-layout";

export const metadata = { title: "使い方 | Sale Scheduler" };

export default function ManualPage() {
  return <PublicDocument eyebrow="Guide" title="Sale Schedulerの使い方" lead="商品を選び、変更内容をPreviewで確認してから予約します。価格変更は指定日時から商品ごとに順次処理されます。">
    <section className="doc-section"><h2>1. 商品を選択</h2><p>カラーミーショップでログイン後、商品名または商品IDで検索します。バリエーションのない商品だけを選択できます。</p></section>
    <section className="doc-section"><h2>2. セール条件を設定</h2><p>セール価格を直接指定するか、割引率を指定します。割引率は商品ごとの販売価格に適用し、1円未満は切り捨てます。開始・終了日時はJSTで入力します。</p></section>
    <section className="doc-section"><h2>3. Previewを確認</h2><p>対象商品、現在価格、セール価格、値引額、開始予定日時、開始・終了処理の概算時間を表示します。概算は1商品あたり最低限必要なGET・PUT・verification GETと、ショップ単位のAPI制限から計算します。</p><div className="public-callout">API制限により、指定した開始日時から順次価格を変更します。全商品が同じ秒に反映されることは保証されません。verification retryや一時的なAPIエラーで時間が延長する場合があります。</div></section>
    <section className="doc-section"><h2>4. 予約後の結果を確認</h2><p>ブラウザを閉じてもWorkerが処理を続けます。履歴の詳細画面で商品単位の成功、失敗、Conflictを確認できます。</p><h3>Conflict</h3><p>終了処理の直前に取得した価格がセール価格と異なる場合、商品価格を変更せずConflictにします。管理画面で意図した価格を確認し、人間が判断してください。</p><h3>verification未確定</h3><p>PUT後に期待価格を確認できない場合は、追加の価格変更をせず確認不能として停止します。第三の価格が継続して見える場合も同様に人間の確認を待ちます。</p></section>
    <section className="doc-section"><h2>対応していない商品・価格</h2><p>バリエーション価格、option_price、会員価格、定価、CSV、画像変更、他ECサービスには対応していません。</p></section>
  </PublicDocument>;
}
