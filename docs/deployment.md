# Deployment

本ドキュメントは本番デプロイ設計です。MVP実装時には本番サーバーへデプロイしません。

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

Compose本体ではPostgreSQLとNext.jsのhost portを公開しません。`docker-compose.local.yml`の`5433`／`3000`公開はローカル開発だけです。ProductionではCaddy profileのみが80／443を公開します。

## Required settings

`.env`（productionではroot専用の秘密ファイル）へ、値ではなく次の項目を設定します。

- `APP_BASE_URL`
- `COLORME_CLIENT_ID`
- `COLORME_CLIENT_SECRET`
- `COLORME_WEBHOOK_SECRET`
- `COLORME_APP_KEY`
- `COLORME_REDIRECT_URI`
- `COLORME_SCOPES=read_products write_products`
- `TOKEN_ENCRYPTION_KEY`（32 bytesをhexまたはbase64で表現）
- `POSTGRES_PASSWORD`
- `DATABASE_URL`（ComposeではDBコンテナ向けに自動構成）
- `APP_DOMAIN`

secretはGitHub、チャット、イメージ、ログへ入れません。`.env`のpermissionはrootのみ読み書き可能にします。

## First deployment outline

1. DNSのA recordをLightsail static IPへ設定し、まずDNS onlyで伝播を確認する。
2. ColorMe Developer Consoleでredirect URIとinstall／uninstall webhook URLを登録する。
3. `.env`へ本番設定を安全に配置する。
4. `docker compose --profile production run --rm migrate`を実行する。
5. `docker compose --profile production up -d db web worker caddy`を実行する。
6. `http://localhost`ではなく、本番URLの`/api/health`をHTTPSで確認する。
7. Caddyの証明書取得後に外部から80／443だけを確認する。
8. Web／Worker再起動、OS再起動、PostgreSQLバックアップ復元手順を確認する。
9. テストショップ1商品で短時間の開始・終了・Conflict E2Eを行う。

本番ドメイン、ColorMe OAuth App、課金、バックアップ保存先が確定するまで公開設定は確定しません。
