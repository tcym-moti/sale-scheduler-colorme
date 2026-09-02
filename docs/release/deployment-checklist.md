# Production deployment checklist

このチェックリストがすべて完了するまで、App Store Appへの切り替えと課金開始を行いません。今回の作業では外部管理画面、DNS、本番サーバーを変更していません。

## Architecture decision

- [ ] `sale-scheduler.tcym.jp`を既存Lightsailへ載せるか、別hostへ分離するか決定
- [ ] 既存Bulk Image UploaderのCaddyが80／443を使用していることを考慮
- [ ] 共有Caddyを使う場合も、Sale SchedulerのDB／volume／環境変数／OAuth Appを分離
- [ ] Sale Scheduler専用Composeがhostの80／443を直接奪わないことを確認

## Cloudflare

- [ ] `sale-scheduler` のA recordを`52.68.226.206`へ設定
- [ ] 初回はDNS Only
- [ ] DNS解決とCaddyの証明書取得を確認
- [ ] HTTPSの`/api/health`を確認
- [ ] 必要性を確認してからProxyへ変更し、SSL/TLSはFull (strict)を選択

## ColorMe Developer Console

- [ ] Sale Scheduler専用OAuth Appを用意
- [ ] scopeは`read_products write_products`だけ
- [ ] callback URLを`https://sale-scheduler.tcym.jp/auth/colorme/callback`へ設定
- [ ] install webhookを`https://sale-scheduler.tcym.jp/webhooks/colorme/install`へ設定
- [ ] uninstall webhookを`https://sale-scheduler.tcym.jp/webhooks/colorme/uninstall`へ設定
- [ ] Client ID、Client Secret、App Key、Webhook Secretを本番用に確認
- [ ] Private AppからApp Storeへ切り替える時期を決定

## Server

- [ ] `/opt/sale-scheduler-colorme/.env.production`をroot:root、`600`で配置
- [ ] `APP_BASE_URL`と`APP_DOMAIN`が本番ドメインと一致
- [ ] `DATABASE_URL`が`db:5432`を指す
- [ ] `TOKEN_ENCRYPTION_KEY`を本番専用値にする
- [ ] R2設定は追加しない（MVPではR2不要）
- [ ] migrationを実行
- [ ] Web／Worker／edgeを起動
- [ ] 5432／3000がhost外部へ公開されていない
- [ ] 80／443以外の公開portがない
- [ ] Web／Worker再起動、OS再起動後の自動復旧を確認

## Backup and operations

- [ ] バックアップ専用の非公開R2バケットと別API Tokenを設定
- [ ] `/etc/sale-scheduler/backup.env`をroot:root、`600`で配置
- [ ] `/etc/sale-scheduler/backup.passphrase`をroot:root、`600`で配置
- [ ] daily timerがactive
- [ ] 7世代保持を確認
- [ ] 検証環境でrestoreを確認
- [ ] `/api/health`、Worker、DB、queue backlogを監視

## Public pages and App Store

- [ ] `/`、`/app`、`/manual`、`/terms`、`/privacy`、`/support`をHTTPSで確認
- [ ] 運営者名、問い合わせ先、料金、解約方法を正式情報へ更新
- [ ] 「指定日時から順次反映」「概算時間は保証値でない」を掲載
- [ ] icon、eyecatch、スクリーンショットを提出
- [ ] reviewer guideで審査用テストショップを再現
- [ ] App Store側で月額980円（税抜）、14日無料を設定するか決定
- [ ] 審査提出後、承認結果を確認してから公開反映
