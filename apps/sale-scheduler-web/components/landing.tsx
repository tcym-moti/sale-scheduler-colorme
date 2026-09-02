import Link from "next/link";
import { PublicLayout } from "./public-layout";

export default function LandingPage() {
  return <PublicLayout><main className="public-main">
    <section className="public-hero">
      <span className="eyebrow">ColorMe shop app</span>
      <h1>セールの開始と、元価格への復元を安全に予約。</h1>
      <p>Sale Schedulerは、カラーミーショップの商品価格を指定日時から順次変更し、終了時にはセール価格が維持されている商品だけを元価格へ戻します。</p>
      <div className="public-actions"><Link className="button primary" href="/auth/colorme">カラーミーショップでログイン</Link><Link className="button" href="/manual">使い方を見る</Link></div>
    </section>
    <section className="public-section"><span className="eyebrow">Safety first</span><h2>手作業の変更忘れと、意図しない上書きを防ぐ</h2><div className="feature-grid"><div className="feature"><strong>開始前にPreview</strong><p>対象商品、変更後価格、値引額、処理時間の概算を確認してから予約できます。</p></div><div className="feature"><strong>指定日時から順次反映</strong><p>API制限を守りながら商品ごとに処理します。全商品が同じ秒に変更されることは保証しません。</p></div><div className="feature"><strong>安全な元価格復元</strong><p>終了時にセール価格が維持されている商品だけを元価格へ戻し、手動変更はConflictとして停止します。</p></div></div></section>
    <section className="public-section"><span className="eyebrow">How it works</span><h2>かんたん4ステップ</h2><div className="process-grid"><div className="process-step"><span className="step-number">01</span><strong>商品を選ぶ</strong><p>商品名や商品IDで検索し、対象商品を複数選択します。</p></div><div className="process-step"><span className="step-number">02</span><strong>条件を確認</strong><p>固定価格または割引率、開始日時、終了日時を設定します。</p></div><div className="process-step"><span className="step-number">03</span><strong>予約を確定</strong><p>Previewで変更内容と概算時間を確認して確定します。</p></div><div className="process-step"><span className="step-number">04</span><strong>結果を見る</strong><p>商品ごとの成功、失敗、Conflictを履歴で確認できます。</p></div></div></section>
    <section className="public-section"><div className="public-callout"><strong>対応範囲:</strong> MVPではバリエーションのない商品に対応しています。バリエーション価格、会員価格、定価は変更しません。</div></section>
  </main></PublicLayout>;
}
