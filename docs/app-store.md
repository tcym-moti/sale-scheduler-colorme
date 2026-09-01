# App Store preparation

## App name

Sale Scheduler for カラーミーショップ

## Short description

セール価格への変更と元価格への復元を予約。手作業の変更忘れを防ぎ、安全にセールを運用できます。

## Detailed description draft

セールの開始・終了時刻に合わせて、カラーミーショップの商品価格を自動変更します。開始時にその時点の価格を保存し、終了時はセール価格が維持されている商品だけを元価格へ戻します。途中で価格が変更された商品はConflictとして停止するため、意図しない価格の上書きを防げます。

商品を検索して複数選択し、固定価格または割引率、開始日時、終了日時を指定。実行前Previewで商品ごとの変更後価格と値引額を確認できます。予約後はブラウザを閉じてもWorkerが処理し、履歴から成功・失敗・Conflictを確認できます。

## Suitable for

- 期間限定セールを毎回手動で開始・終了しているショップ
- セール終了後の価格戻し忘れを防ぎたいショップ
- 手動価格変更があった商品を自動復元から除外したいショップ

## How to use

1. カラーミーショップからログイン
2. 商品を検索して選択
3. 固定セール価格または割引率と期間を入力
4. Previewで変更内容を確認
5. 予約を確定
6. 履歴で処理結果とConflictを確認

## MVP limitations

バリエーション商品、会員価格、定価、CSV、画像、商品削除、画像並べ替え、他ECプラットフォームには対応していません。料金・無料期間はApp Store設定で決定し、アプリコードには固定しません。

## Review checklist

- App icon 1200×1200 PNG/JPEG
- Eyecatch 1320×740 PNG/JPEG
- 利用イメージ最大5枚
- アプリ設定ページURL
- 利用方法URL、利用規約URL、プライバシーポリシーURL
- 問い合わせ先
- Install／Uninstall webhook、OAuth callbackの疎通
- 料金と無料期間のApp Store設定
- テストショップ1商品で開始、終了、Conflictを確認
