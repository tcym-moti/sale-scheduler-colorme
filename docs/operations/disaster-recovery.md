# Disaster recovery

この手順は、Sale Scheduler専用PostgreSQLを別環境へ復元するための準備書です。通常運用中に実行せず、復元対象と承認を確認してから行います。復元コマンドへ秘密値を直接書かず、backup.envとpassphrase fileをroot専用で参照します。

## Backup design

- PostgreSQLを毎日03:15頃（systemdのhost timezone）に`pg_dump`する
- gzip後にGPG AES-256で暗号化する
- Sale Scheduler画像用とは別の非公開R2バケットへ保存する
- バックアップ専用R2 API Tokenを使う
- 最新7世代だけを保持する
- `backup.env`と`backup.passphrase`はWeb／Workerへ渡さない
- systemd unitは`infra/systemd/`、実行スクリプトは`infra/scripts/backup-postgres.sh`

## Initial host setup

1. `aws` CLIと`gpg`をroot管理下へインストールする。
2. `/etc/sale-scheduler/`をroot:root、`700`で作成する。
3. `sale-scheduler-backup.env.example`を`/etc/sale-scheduler/backup.env`へコピーし、バックアップ専用R2の接続項目だけを設定する。
4. `backup.passphrase`を十分な強度で生成し、改行を含む単一の秘密値として`600`で保存する。値を画面、チャット、ログへ表示しない。
5. `backup.env`と`backup.passphrase`をroot:root、`600`にする。
6. service／timerを`/etc/systemd/system/`へコピーし、`systemctl daemon-reload`後にtimerをenableする。

## Verification

初回は本番DBへ影響しない検証環境で行います。

1. `systemctl status sale-scheduler-backup.timer`でtimerが有効であることを確認する。
2. serviceを手動実行し、終了コード、journal、バックアップ用R2バケット内の新しい暗号化オブジェクトを確認する。ログへ認証情報やdump内容が出ていないことも確認する。
3. 7世代を超えた古いオブジェクトだけが削除されることを確認する。
4. 検証用DBを作成し、最新オブジェクトを取得・復号・展開して`psql`で復元する。
5. migrationの状態、shops、sale_schedules、sale_schedule_items、sale_jobs、audit_logsの件数とshop境界を確認する。
6. 復元後にWeb／Workerのhealth、予約取得、監査ログ参照を確認する。

## Restore outline

復元は停止時間とデータ消失範囲を決めてから実施します。既存DBを上書きする前に、現在のDBを別名で退避します。

```text
Web／Workerを停止
↓
現在のDBを別名へdump
↓
復元先DBを用意
↓
バックアップ用R2から最新の暗号化dumpを取得
↓
backup.passphraseで復号
↓
gzipを展開してpsqlへ投入
↓
migration・件数・shop isolationを確認
↓
Web／Workerを起動
↓
/api/health、Worker、予約・履歴を確認
```

実行時は、対象のCompose project、DB名、バックアップ世代を二人で確認します。復元後、外部ColorMe APIへ価格変更を送る前に、Workerが意図せず古いdue jobを取得しないことを確認してください。

## Recovery limits

- R2とLightsailの両方が利用できない場合は、このバックアップだけでは復旧できません。
- 最後のバックアップ以降のDB更新は失われる可能性があります。
- ColorMe側の商品価格はDB復元だけでは戻りません。復元後は各schedule／itemの監査ログと外部商品価格を人間が確認します。
- GPG passphraseを失った暗号化バックアップは復号できません。passphraseはバックアップとは別の安全な保管場所にも保管します。
