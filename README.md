# Sale Scheduler for カラーミーショップ

カラーミーショップの商品を、指定日時にセール価格へ変更し、終了時に安全に元価格へ戻す独立型App Storeアプリです。

## MVP

- 商品一覧取得・商品名／商品ID検索
- バリエーションなし商品の複数選択
- 固定セール価格または割引率の指定
- JST表示、UTC保存の開始・終了日時
- 実行前Previewと重複予約チェック
- 開始時の実効元価格保存、セール価格変更、再取得確認
- 終了時は現在価格がセール価格のままの場合だけ元価格へ復元
- 期間中の手動変更はConflictとして停止し、価格を上書きしない
- PostgreSQLキュー、Worker lease、再試行、shop＋商品単位の排他
- 予約履歴、商品単位の結果、監査ログ、開始前キャンセル
- 開始後のキャンセルは安全な終了・復元として扱う

MVPではバリエーション商品、`option_price`、会員価格、定価、CSV、R2、外部EC連携には対応しません。

## アーキテクチャ

```text
Browser
  │ HTTPS / Caddy
  ▼
Next.js Web ── PostgreSQL (予約・キュー・セッション・監査ログ)
                         ▲
                         │ FOR UPDATE SKIP LOCKED + lease
                    Node.js Worker ── ColorMe API
```

`apps/sale-scheduler-web`、`apps/sale-scheduler-worker`、`packages/*` はこのリポジトリ内で完結し、Bulk Image Uploaderへ依存しません。画像を扱わないため、MVPにR2はありません。

## セットアップ

Node.js 22、pnpm 11、Docker Composeが必要です。

```powershell
Copy-Item .env.example .env
# .envへローカル用のPOSTGRES_PASSWORDとColorMe OAuth設定を入力
pnpm install
pnpm db:migrate
pnpm dev
pnpm dev:worker
```

Dockerで起動する場合は、`.env`の`POSTGRES_PASSWORD`を設定してから実行します。

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

ローカルWebは`http://localhost:3000`、DBは`localhost:5433`です。Compose本体ではDBとWebをホストへ公開せず、`docker-compose.local.yml`だけが開発用に公開します。

## テスト

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose build web worker migrate
```

Fake ColorMe APIを使うテストで、通常復元、Conflict、429／503 retry、Worker再起動後の再照合、開始前キャンセル、開始後キャンセルを検証します。`DATABASE_URL`がある場合はPostgreSQL統合テストも実行されます。

## セキュリティ

- OAuth access tokenはAES-256-GCMで暗号化して保存
- OAuth stateはDBで一度だけ消費
- Webhookは`X-Appstore-Signature`のHMAC-SHA256＋Base64を検証
- 変更系APIはCSRFトークンを検証
- セッションCookieはHttpOnly、Secure（本番）、SameSite
- 商品IDとshop IDをサーバー側で再検証
- 価格変更前後のGETを必須化
- Token、OAuth secret、API response bodyはログ・監査ログに保存しない

## 制限事項

- バリエーションなし商品だけが対象です。バリエーション商品を選択・実行することはできません。
- ColorMe APIにatomic CAS／If-Matchがないため、完全な同時編集防止はできません。直前GET、商品単位DB lock、PUT後GET確認、Conflict停止で安全側に倒します。
- 割引率計算の端数は各商品ごとに1円未満を切り捨てます。
- 同一商品に期間が重なる予約は作成できません。
- 料金はコードへ固定していません。

## ドキュメント

- [アーキテクチャ](docs/architecture.md)
- [安全設計](docs/safety.md)
- [テスト計画・結果](docs/testing.md)
- [デプロイ手順](docs/deployment.md)
- [運用手順](docs/operations.md)
- [App Store準備](docs/app-store.md)
