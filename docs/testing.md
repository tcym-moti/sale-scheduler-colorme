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
- PUT後のread-after-write遅延（START: 古い値→期待値）→ `ACTIVE`
- PUT後のread-after-write遅延（END: 古い値→期待値）→ `COMPLETED`、誤った`CONFLICT`なし
- PUT後の古い値が続く → `VERIFY_UNKNOWN`、追加PUTなし
- PUT後に第三の価格が続く → `POST_WRITE_DIVERGENCE`、追加PUTなし
- END前GETで手動変更を検出 → `CONFLICT`、PUTなし

verificationは初回GETを即時に行い、既定では最大5回まで確認します。確認間隔は500ms、1秒、2秒、4秒です。テストでは待機時間を短縮できる設定を使い、各attemptと最終結果が監査ログに残ることも確認します。

## 実行

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose build web worker migrate
```

実装時の確認結果（2026-09-02）:

- lint: 成功
- typecheck: 成功
- ホスト環境のUnit／認証／Fake API: 12件成功（DB統合14件はDB未接続のためskip）
- Docker／PostgreSQL接続環境のUnit／認証／Fake API／Worker統合: 26件成功
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
2. 通常フロー: テスト商品を1,200円 → 1,000円へ開始処理し、DBを`ACTIVE`、外部APIを1,000円として確認した。
3. 通常フローの終了処理: 1,000円 → 1,200円の復元PUT後にverificationを実行し、DBを`COMPLETED`、商品単位を`COMPLETED`、外部APIを1,200円として確認した。START／ENDともverification 1回目で`CONFIRMED`となり、誤った`CONFLICT`は発生しなかった。
4. Conflictフロー: 同じテスト商品を1,200円 → 1,000円へ開始後、ショップ管理画面から850円へ手動変更した。終了前GETで850円を検出し、`END_CONFLICT`を記録して終了PUTを実行しなかった。DBは`CONFLICT`、外部API価格は850円のまま維持された。
5. Conflict確認後、テスト商品の価格は管理画面から元の1,200円へ戻し、API再取得で確認した。
6. DBでは予約・商品単位状態・START／END job・監査ログを確認した。通常フローではverification attemptと最終結果、Conflictフローでは観測価格とPUT前判定を確認できた。Workerコンテナは稼働中で、プロセス応答も確認した。

実ショップE2Eは、OAuth、商品取得、通常の開始・終了・元価格復元、read-after-write遅延を考慮した有限verification、手動変更を保護するConflict、DB監査、Worker継続を確認済みとする。大量商品、本番デプロイ、App Store Appへの切り替え、課金設定は実施していない。
