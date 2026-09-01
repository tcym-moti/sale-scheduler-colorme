# Testing

## 自動テスト

`tests/fake-colorme.ts`は商品状態をメモリに持つHTTPサーバーです。PUTのbody、商品価格、API呼び出し回数を検証できます。

必須ケース:

- 1000円 → 800円 → 1000円
- セール中に900円へ手動変更 → 終了時は900円を維持してCONFLICT
- 開始PUT 429 → retry → 成功
- 終了PUT 503 → retry → 成功
- Worker二重claim → 同一jobを二重取得しない
- Worker再起動相当のlease回収 → UNKNOWNをGET再照合し、目的価格なら二重PUTしない
- 開始前キャンセル → ColorMe API呼び出しなし
- ACTIVE中キャンセル → END jobとして安全復元
- 商品バリエーションあり → PUTせず失敗

## 実行

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose build web worker migrate
```

実装時の確認結果（2026-09-01）:

- lint: 成功
- typecheck: 成功
- Unit／認証／Fake API／PostgreSQL／Worker統合: 20件成功
- Next.js production build: 成功
- Worker production build: 成功
- Docker image build（web／worker／migrate）: 成功
- GitHub Actions CI（quality／docker）: 成功
- ローカルComposeの`/api/health`: `{"ok":true}`を確認

PostgreSQL統合テストを実行する場合は`DATABASE_URL`を設定し、migrationを適用します。テスト用DBは本番DBと分離してください。

## 実ショップE2E

テストショップのバリエーションなし商品を1件ずつ使用し、大量商品・有料ショップ・本番ドメインではテストしません。既存Bulk Image UploaderのOAuth secretやtokenは流用しません。

実施結果（2026-09-02、Sale Scheduler専用Private App）:

1. OAuth callback成功。ダッシュボードにショップ名とAccount IDが表示され、商品一覧を取得できた。
2. 通常フロー: 1,000円 → 800円の開始処理は成功し、開始後の再取得で800円を確認した。
3. 通常フローの終了処理では、復元PUT後の直後GETが一時的に800円を返したため、アプリは安全側に`END_VERIFY_CONFLICT`として停止した。その後の再取得では1,000円へ復元されていたため、外部商品の元価格復元自体は確認できた。ColorMe APIのread-after-write整合性を考慮した確認リトライは本番化前の改善候補とする。
4. Conflictフロー: 1,100円 → 900円の開始後、管理画面から850円へ手動変更した。終了時にアプリは`CONFLICT`とし、自動復元を行わず、外部API価格も850円のまま維持した。
5. Conflict確認後、テスト商品の価格は管理画面から元の1,100円へ戻し、API再取得で確認した。
6. DBでは予約・商品単位状態・START/END job・監査ログを確認した。監査ログに価格変更要求、確認、Conflict理由、観測価格が記録されている。Workerコンテナは稼働中で、プロセス応答も確認した。

実ショップE2Eは、通常価格変更・外部復元、手動変更を保護するConflict、OAuth、DB監査、Worker稼働を確認済みとする。ただし、復元直後のGETが古い値を返したケースがあるため、App Store公開前に実APIでの確認待ち時間・再取得方針を決める。
