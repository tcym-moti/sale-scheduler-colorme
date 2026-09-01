# Architecture

## 境界

Sale SchedulerはBulk Image Uploaderとは別のアプリ、別のOAuth App、別のDB、別の環境変数、別のデプロイ単位です。実装コードは必要な設計だけを独立して持ち、既存リポジトリをnpm依存にはしません。OAuth token、production `.env`、ショップデータもコピーしません。

## コンポーネント

| Component | Responsibility |
| --- | --- |
| `apps/sale-scheduler-web` | UI、OAuth、App Store webhook、商品検索、Preview、予約操作API |
| `apps/sale-scheduler-worker` | due job取得、開始・終了PUT、確認GET、retry、Conflict判定 |
| `packages/colorme-api` | ColorMe API client、Bearer header、商品取得、価格更新、HTTP error分類 |
| `packages/colorme-auth` | AES-256-GCM、OAuth state、session cookie、Webhook HMAC |
| `packages/database` | PostgreSQL接続、migration、shop/session/schedule/job repository |
| `packages/jobs` | PostgreSQL rate limiter、retry policy |
| `packages/shared` | status、price calculation、validation、domain types |

## データモデル

- `shops`: ColorMe account境界とショップ状態
- `app_installations`: App Store install情報
- `oauth_tokens`: 暗号化access／refresh token
- `app_sessions`, `oauth_states`: sessionとOAuth CSRF状態
- `sale_schedules`: 予約の日時、価格方式、予約全体の状態
- `sale_schedule_items`: 商品ごとの元価格、実効元価格、予定価格、実行結果
- `sale_jobs`: 商品ごとのSTART／END job、retry、lease、mutation state
- `api_rate_events`: shop単位の10秒sliding-window rate limiter
- `audit_logs`: 価格変更の要求、確認、失敗、Conflict

## Worker sequence

1. `sale_jobs`のdue行を`FOR UPDATE SKIP LOCKED`で1件claimし、leaseを設定する。
2. shop＋productのtransaction advisory lockを取得する。
3. 商品をGETする。開始時は実効元価格をこの時点で保存する。
4. 既に目的価格ならPUTせず、冪等に成功扱いにする。
5. 変更が必要な場合のみPUTする。
6. PUT後に必ずGETし、期待価格を確認する。
7. 成功時だけ次の状態へ進める。通信結果が不明な場合は`UNKNOWN`として再実行時にGETで再照合する。

Worker停止中に時刻を過ぎたjobは、復旧後のpollで処理します。開始時刻と終了時刻を両方過ぎているSTART jobは、セールを開始せずキャンセル扱いにします。
