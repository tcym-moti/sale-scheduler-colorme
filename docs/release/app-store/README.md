# App Store submission package

このディレクトリは、カラーミーショップ App Store提出時に使う説明文、審査手順、画像素材をまとめたものです。

## Basic listing

- アプリ名: Sale Scheduler for カラーミーショップ
- 短い説明: セール価格への変更と元価格への復元を予約。手作業の変更忘れを防ぎ、安全にセールを運用できます。
- 想定料金: 月額980円（税抜）、14日間無料（App Store側で設定。コードには固定しない）
- 対象: バリエーションのない商品の`sales_price`

## Important wording

「指定日時に全商品を同時変更」とは説明しません。正確な説明は次のとおりです。

> 指定した開始日時から、ColorMe APIの制限を守りながら商品ごとに順次価格を変更します。終了時の復元も商品ごとに順次行います。verification retryや通信状況により、Previewの概算時間を超える場合があります。

## Files

- `assets/icon-1200.png` — App Store icon
- `assets/eyecatch-1320x740.png` — App Store eyecatch
- `assets/screenshot-01-selection.png` — 商品選択・条件設定
- `assets/screenshot-02-preview.png` — Preview、概算時間、順次反映の説明
- `assets/screenshot-03-history.png` — 成功・Conflictの履歴
- `reviewer-guide.md` — 審査担当者向け操作手順

画像は提出説明用のモックです。実ショップの秘密情報、OAuth token、個人情報は含めません。

## Submission URLs

本番ドメイン確定後に次のURLをApp Store設定へ登録します。

- アプリ設定ページ: `https://sale-scheduler.tcym.jp/app`
- 利用方法: `https://sale-scheduler.tcym.jp/manual`
- 利用規約: `https://sale-scheduler.tcym.jp/terms`
- プライバシーポリシー: `https://sale-scheduler.tcym.jp/privacy`
- 問い合わせ: `https://sale-scheduler.tcym.jp/support`

現時点ではproduction deploy、DNS、App Store切替、課金設定は未実施です。`OPERATOR_NAME`と`SUPPORT_EMAIL`または`SUPPORT_URL`をproductionへ設定してから提出します。
