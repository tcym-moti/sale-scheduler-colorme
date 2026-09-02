# Deployment

本ドキュメントは本番デプロイ準備と手順です。今回のMVP作業では本番サーバーへSale Schedulerをデプロイしません。

## Production topology

```text
Internet :80/:443
       │
     Caddy
       │ internal Docker network
   Next.js Web :3000
       │
 PostgreSQL :5432 ── Worker
```

Compose本体ではPostgreSQLとNext.jsのhost portを公開しません。`docker-compose.local.yml`の`5433`／`3000`公開はローカル開発だけです。`docker-compose.production.yml`ではCaddyだけが80／443を公開し、DBはDockerネットワーク内の`5432`、WebはDockerネットワーク内の`3000`だけで待ち受けます。

Sale Schedulerのproduction Composeは、`docker-compose.production.yml`と`.env.production`、専用volume名を使います。Bulk Image UploaderのCompose、volume、環境変数、DBは共有・上書きしません。

## Required settings

`.env.production`（productionではroot専用の秘密ファイル）へ、値ではなく次の項目を設定します。

- `APP_BASE_URL`
- `COLORME_CLIENT_ID`
- `COLORME_CLIENT_SECRET`
- `COLORME_WEBHOOK_SECRET`
- `COLORME_APP_KEY`
- `COLORME_REDIRECT_URI`
- `COLORME_SCOPES=read_products write_products`
- `TOKEN_ENCRYPTION_KEY`（32 bytesをhexまたはbase64で表現）
- `POSTGRES_PASSWORD`
- `DATABASE_URL`（`db`をホスト名とするDocker内部接続）
- `APP_DOMAIN`
- `VERIFY_MAX_ATTEMPTS`
- `VERIFY_BACKOFF_MS`
- `OPERATOR_NAME`
- `SUPPORT_EMAIL` または `SUPPORT_URL`

Sale Scheduler MVPではR2設定は不要です。secretはGitHub、チャット、イメージ、ログへ入れません。`.env.production`のownerはroot、permissionは`600`とします。バックアップ認証情報と暗号化パスフレーズはWeb／Workerの環境変数へ共有しません。

## Current Lightsail assessment

2026-09-02に既存Lightsail（`52.68.226.206`）を読み取り専用で確認した結果です。

| 項目 | 確認結果 |
| --- | --- |
| CPU | 2 vCPU |
| RAM | 約1.9 GiB、available 約1.2 GiB |
| Swap | 2.0 GiB（有効） |
| Disk | 58 GiB中約8.5 GiB使用、約49 GiB空き |
| Docker | active／enabled、Engine 29.7.2、Compose v5.5.0 |
| 外部listen | TCP 22、80、443のみ。5432／3000なし |
| 既存サービス | Bulk Image UploaderのWeb／Worker／PostgreSQL／Caddy稼働中 |

2GB RAM上での共存は余裕が大きくありません。プラン変更はしていません。特に既存Bulk Image UploaderのCaddyがhostの80／443を使用しているため、Sale SchedulerのCaddyを同じhostでそのまま起動することはできません。公開前に、(a)既存Caddyを共有エッジとしてSale Schedulerへルーティングするか、(b)Sale Schedulerを別hostへ分離するかを決定してください。今回この判断のために既存構成を変更していません。

## First deployment outline

1. DNSのA recordをLightsail static IPへ設定し、まずDNS onlyで伝播を確認する。
2. ColorMe Developer Consoleでredirect URIとinstall／uninstall webhook URLを登録する。
3. `/opt/sale-scheduler-colorme/.env.production`をroot所有・`600`で作成する。
4. `docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate`を実行する。
5. `docker compose --env-file .env.production -f docker-compose.production.yml up -d db web worker caddy`を実行する。ただし現在のhostでは既存Caddyの80／443占有を解決してから実施する。
6. `http://localhost`ではなく、本番URLの`/api/health`をHTTPSで確認する。
7. Caddyの証明書取得後に外部から80／443だけを確認する。
8. Web／Worker再起動、OS再起動、PostgreSQLバックアップ復元手順を確認する。
9. テストショップ1商品で短時間の開始・終了・Conflict E2Eを行う。
10. App Store切替と課金設定は、外部設定の確認後に人手で行う。

## Production validation checklist

- [ ] `.env.production`がroot:root、`600`で、Git管理対象外
- [ ] `DATABASE_URL`が外部DBではなくCompose内部の`db:5432`
- [ ] `ss -lntup`でhostの5432／3000がlistenしていない
- [ ] Caddy以外のhost portを公開していない
- [ ] `/api/health`がHTTPSで`ok: true`
- [ ] Web／Workerの再起動後に復旧
- [ ] OS再起動後にDB／Web／Worker／edgeが復旧
- [ ] PostgreSQL backup timerがactiveで、7世代保持とrestore手順を確認
- [ ] ColorMe OAuth、install／uninstall webhook、shop isolationを確認
- [ ] 運営者名・利用規約・プライバシー・問い合わせ先を設定

本番ドメイン、ColorMe OAuth App、課金、バックアップ保存先、共有Caddyの構成が確定するまで公開設定は確定しません。
