# Operations

Sale Schedulerは、指定した開始日時から商品を順次処理します。API制限、verification retry、ネットワーク遅延により、全商品が同時刻に変更されることや、概算処理時間内に完了することは保証しません。終了時の復元も商品ごとに順次行います。

## Health

- Web: `GET /api/health`
- Worker: Docker health／ログの`worker_fatal`有無、queue backlog
- DB: PostgreSQL healthcheck、接続数、ディスク
- ColorMe API: 429、503、5xxの件数とretry待ちjob

ログにはrequest ID、shop ID、schedule ID、item ID、endpoint、status、duration、retry countだけを記録し、tokenと画像・API response bodyは記録しません。

## Worker復旧

Workerが停止しても予約とjobはDBに残ります。Worker再起動時に期限切れleaseを回収し、due jobを処理します。外部APIへのPUT直後に停止した可能性があるjobは`UNKNOWN`としてGET再照合します。

## Conflict対応

1. 予約詳細で元価格、セール価格、現在価格、Conflict理由を確認する。
2. ColorMe管理画面で商品価格を確認する。
3. 意図した価格を人間が決定する。
4. 必要ならColorMe管理画面で価格を修正し、履歴を残す。

Conflictを自動retryして元価格を強制することはありません。

## Retry対応

429、503、5xx、timeout、connection resetは5秒、10秒、20秒、40秒、60秒を基準にjitter付きで再試行します。恒久的な4xxは再試行しません。5回のretry待ちを使い切ったjobはFAILEDとし、画面から失敗項目だけ再実行できます。

## DB backup（production checklist）

productionではPostgreSQLの`pg_dump`を毎日実行し、アプリDBとは別の非公開R2バケットへ暗号化して保存します。7世代を保持し、バックアップ用認証情報と暗号化パスフレーズはWeb／Workerの環境変数へ共有しません。

systemdの雛形は`infra/systemd/sale-scheduler-backup.service`と`infra/systemd/sale-scheduler-backup.timer`、実行スクリプトは`infra/scripts/backup-postgres.sh`です。実サーバーへ配置する際は、環境変数ファイルをroot専用・`600`で別途用意し、timerの実行結果とR2オブジェクトを確認してください。restore手順は`docs/operations/disaster-recovery.md`に記載します。復元テストは月1回行います。

## 公開前運用チェック

- `/api/health`、Worker、DBの状態を確認
- queue backlog、FAILED／CONFLICT／VERIFY_UNKNOWNを確認
- 80／443以外の外部公開がないことを確認
- Web／Worker再起動とOS再起動後の自動復旧を確認
- backup timer、7世代保持、restore手順を確認
- support、terms、privacyの本番表示を確認

## Uninstall

Uninstall webhookの署名を検証した後、installationをUNINSTALLEDにし、未実行jobを停止し、tokenとsessionを削除します。予約履歴は運用方針に従って保持・削除し、ショップ境界を越えて参照できないようにします。
