# Operations

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

productionではPostgreSQLの`pg_dump`を毎日実行し、アプリDBとは別の非公開ストレージへ暗号化して保存します。7世代を保持し、バックアップ用認証情報と暗号化パスフレーズはWeb／Workerの環境変数へ共有しません。復元テストを月1回行い、実装・ホストに合わせた具体的なservice／timerはデプロイ時に作成します。

## Uninstall

Uninstall webhookの署名を検証した後、installationをUNINSTALLEDにし、未実行jobを停止し、tokenとsessionを削除します。予約履歴は運用方針に従って保持・削除し、ショップ境界を越えて参照できないようにします。
