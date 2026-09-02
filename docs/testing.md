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
- ホスト環境のUnit／認証／Fake API: 13件成功（DB統合14件はDB未接続のためskip）
- Docker／PostgreSQL接続環境のUnit／認証／Fake API／Worker統合: 27件成功
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

### 複数商品E2E（2026-09-02）

テストショップのバリエーションなし商品10件（既存3件＋Sale Scheduler用テスト商品7件）を使い、固定価格800円で、通常フローと手動変更を挟むConflictフローを確認した。UIのPreviewでは、開始・終了とも「約2分」と表示され、API制限により指定時刻から順次反映されること、verification retry等で延長する可能性が表示された。

通常フロー:

- 10件を選択し、Previewで10件すべて「登録可能」を確認。
- 開始側は10件すべてが800円へ反映され、商品単位`COMPLETED`相当の`ACTIVE`状態、START job 10件が`SUCCEEDED`。
- 監査ログは`START_PRICE_UPDATE_REQUESTED`、`START_PRICE_UPDATE_VERIFICATION`、`START_PRICE_UPDATE_CONFIRMED`が各10件。
- 終了側は10件すべてが開始前価格（900〜1,600円）へ復元され、予約全体・商品単位とも`COMPLETED`。END job 10件が`SUCCEEDED`。
- 監査ログは`END_PRICE_UPDATE_REQUESTED`、`END_PRICE_UPDATE_VERIFICATION`、`END_PRICE_UPDATE_CONFIRMED`が各10件。
- 開始処理は最初の要求から最後の確認まで約70秒、終了処理は約71秒。Previewの概算を超えるRate Limitエラーやretryは発生しなかった。
- ColorMe管理画面で10件すべての元価格への復元を確認した。

Conflictフロー:

- 同じ10件を再度800円へ変更する予約を作成し、開始側10件の成功を確認。
- 商品ID 193300268（開始前価格1,600円）だけを管理画面から850円へ手動変更。
- 終了前GETで850円を検出した商品はPUTを行わず、商品単位`CONFLICT`として850円を維持。
- 残り9件は元価格へ復元され、商品単位で9件`COMPLETED`、1件`CONFLICT`、予約全体は`CONFLICT`。
- `END_CONFLICT`は1件、終了価格更新の要求・検証・確認は各9件。Conflict商品に対する終了PUTは0件。
- 手動変更商品はテスト後、管理画面から元の1,600円へ戻し、10件すべての最終価格を管理画面で確認した。
- ConflictフローでもRate Limitエラー、API一時障害、retryは発生しなかった。Conflictによるjobの`last_error`は想定された安全停止の記録であり、再試行による上書きは行っていない。

複数商品E2Eでは、Workerの順次処理、Previewの概算表示、Rate Limit内の処理、商品単位の部分成功、手動変更商品の非破壊的なConflict停止、監査ログを確認済みとする。テスト時刻は検証を短時間で行うため、予約作成後にDB上の開始・終了時刻をテスト用に短縮した。本番運用ではユーザーが指定したJST時刻をそのまま使用する。
