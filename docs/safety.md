# Safety model

## 価格の保存

予約作成時の価格は`original_price`として記録します。ただし予約作成後にショップ管理画面で価格が変更される可能性があるため、開始実行時のGET結果を`effective_original_price`として確定します。終了時の復元には後者を使います。

## 開始

```text
GET product
  ├ variantあり / sales_priceなし → FAILED（PUTしない）
  ├ current == scheduled → 既に適用済みとして成功（PUTしない）
  └ currentが開始時の実効元価格 → PUT scheduled_price
                                      ↓
                                GETで再確認
```

通信失敗後にPUT結果が分からない場合は、jobを`UNKNOWN`にします。再開時に現在価格がscheduled priceならPUTせず成功、元価格なら安全に再PUT、それ以外ならConflictです。

## 終了・Conflict

```text
GET product
  ├ current == effective_original_price → 復元済みとして成功（PUTしない）
  ├ current != scheduled_price          → CONFLICT（PUTしない）
  └ current == scheduled_price          → PUT effective_original_price → GET確認
```

セール中にショップオーナーが価格を変更した場合、元価格へ強制復元しません。画面には元価格、セール価格、確認できた現在価格、理由を表示します。

## 同時編集の限界

ColorMe APIにIf-Match等のatomic CASがない前提です。次の対策を組み合わせます。

- PUT直前GET
- PUT直後GET
- 同一shop＋productのtransaction advisory lock
- item単位のunique START／END job
- lease期限切れの回収
- `UNKNOWN` mutation stateでの再照合
- 重複期間の予約禁止

これでも外部管理画面との完全なatomic競合防止はできないため、確認できない状態は自動復元せずConflictにします。

## 価格ルール

- `sales_price`だけを変更します。
- 予約価格は整数円、100円以上です。
- 割引率は1〜99%です。
- 割引計算は`floor(current_price * (100 - rate) / 100)`です。
- 予約作成時とPreview時にバリエーション有無、価格下限、予約重複を検証します。
