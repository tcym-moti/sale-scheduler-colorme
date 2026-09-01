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
- Unit／Fake API／PostgreSQL／Worker統合: 17件成功
- Next.js production build: 成功
- Worker production build: 成功
- Docker image build（web／worker／migrate）: 成功
- GitHub Actions CI（quality／docker）: 成功
- ローカルComposeの`/api/health`: `{"ok":true}`を確認

PostgreSQL統合テストを実行する場合は`DATABASE_URL`を設定し、migrationを適用します。テスト用DBは本番DBと分離してください。

## 実ショップE2E

本実装後はテストショップの商品1件だけを使い、以下を手動確認します。

1. 商品取得、元の`sales_price`記録
2. 数分後開始の予約でセール価格へ変更
3. ColorMe管理画面またはAPI再取得で反映確認
4. 数分後終了で元価格へ復元確認
5. 再度予約を実行し、セール価格適用後に管理画面で別価格へ変更
6. 終了後に自動復元されず、アプリがCONFLICTになることを確認

テストショップの元価格は開始前に記録し、異常時もその価格へ戻せる状態を維持します。大量商品・有料ショップ・本番ドメインではテストしません。

新規の独立ColorMe OAuth Appが未登録のため、独立アプリとしてのテストショップOAuth／価格変更E2EとConflict E2Eは、OAuth App登録後の未完了項目です。既存Bulk Image UploaderのOAuth secretやtokenは流用しません。
