import { PublicDocument } from "../../components/public-layout";

export const metadata = { title: "プライバシーポリシー | Sale Scheduler" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const operatorName = process.env.OPERATOR_NAME?.trim() || "公開前に設定してください";
  return <PublicDocument eyebrow="Privacy" title="プライバシーポリシー" lead="Sale Schedulerが取り扱う情報と、その利用目的を説明します。受注情報や顧客情報は取得しません。">
    <section className="doc-section"><h2>1. 取得する情報</h2><ul><li>カラーミーショップのアカウント識別子、ショップ名、インストール情報</li><li>OAuth認可により取得したアクセストークン（暗号化して保存）</li><li>予約、商品ID、商品名のスナップショット、価格、実行結果、監査ログ</li><li>セッション情報、エラーや処理状況に関する運用ログ</li></ul><p>受注情報、顧客情報、決済情報は取得しません。</p></section>
    <section className="doc-section"><h2>2. 利用目的</h2><p>商品の価格変更予約を実行するため、実行結果を表示するため、障害対応・不正利用防止・サービス改善のために利用します。</p></section>
    <section className="doc-section"><h2>3. 保管と安全管理</h2><p>OAuth tokenは暗号化して保存し、秘密値やtokenをログ・監査ログへ記録しません。ショップ単位でアクセスを分離し、不要になったセッションやアンインストール後の情報は運用方針に従って削除または匿名化します。</p></section>
    <section className="doc-section"><h2>4. 第三者サービス</h2><p>本サービスはカラーミーショップAPI、ホスティング、データベース等のサービスを利用します。各サービスへ必要最小限の情報を送信し、受注・顧客情報は送信しません。</p></section>
    <section className="doc-section"><h2>5. 開示・訂正・問い合わせ</h2><p>個人情報に関する問い合わせはサポート窓口で受け付けます。正式な運営者名と連絡先はApp Store公開前に設定します。</p></section>
    <section className="doc-section"><h2>運営者</h2><p className="placeholder">{operatorName}</p></section>
  </PublicDocument>;
}
