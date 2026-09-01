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
                              VERIFY_PENDING
                                       ↓
                         bounded GET verification
```

開始PUTが成功した後は、itemを`VERIFY_PENDING`にしてGET確認を行います。確認は最大5回（初回は即時、その後の既定待機は500ms、1秒、2秒、4秒）で、無限に再試行しません。期待する`scheduled_price`が確認できた場合だけ`ACTIVE`にします。

一定回数確認しても期待値が確定できない場合は、`VERIFY_UNKNOWN`または`POST_WRITE_DIVERGENCE`として停止します。いずれも追加PUTは行わず、価格変更結果を人間が確認します。PUT結果が分からない通信失敗も、再開時に現在価格を再照合してから判断します。

## 終了・Conflict

```text
GET product
  ├ current == effective_original_price → 復元済みとして成功（PUTしない）
  ├ current != scheduled_price          → CONFLICT（PUTしない）
  └ current == scheduled_price          → PUT effective_original_price
                                             ↓
                                           VERIFY_PENDING
                                             ↓
                                  bounded GET verification
```

終了時の`CONFLICT`は、復元PUTの前に取得した現在価格が`scheduled_price`と異なる場合だけです。したがって、セール中にショップオーナーが価格を変更した場合は元価格へ強制復元せず、PUTを実行しません。画面には元価格、セール価格、現在価格、終了日時、理由を表示します。

一方、復元PUT前の価格が`scheduled_price`だった場合、PUT直後のGETが一時的に古いセール価格を返しても`CONFLICT`にはしません。GET確認を既定の有限回数だけ続けます。

- 最終観測値が期待する元価格: 復元成功
- 最終観測値がPUT前のセール価格のまま: `VERIFY_UNKNOWN`
- 最終観測値が元価格でもセール価格でもない第三の価格: `POST_WRITE_DIVERGENCE`

後2つは追加の価格変更をせず、人間の確認を待ちます。特に第三の価格を見た場合、アプリが勝手に元価格やセール価格へ上書きすることはありません。

## 同時編集の限界

ColorMe APIにIf-Match等のatomic CASがない前提です。次の対策を組み合わせます。

- PUT直前GET
- PUT直後GET
- PUT後の有限回GET確認（`VERIFY_PENDING` → 確定または安全側停止）
- 同一shop＋productのtransaction advisory lock
- item単位のunique START／END job
- lease期限切れの回収
- `UNKNOWN` mutation stateでの再照合
- 重複期間の予約禁止

これでも外部管理画面との完全なatomic競合防止はできません。そのため、PUT前の価格差だけを`CONFLICT`とし、PUT後に確認できない状態は`VERIFY_UNKNOWN`、第三の価格が継続する状態は`POST_WRITE_DIVERGENCE`として区別します。

## 検証監査ログ

開始・終了の各価格PUTについて、次の情報を監査ログへ保存します。

- PUT時刻と操作（START／END）
- 期待価格、PUT前価格、各verification attemptの番号
- 各回の観測価格、最大試行回数、retry回数
- `CONFIRMED`、`VERIFY_UNKNOWN`、`POST_WRITE_DIVERGENCE`などの最終結果
- HTTP status（取得できる場合）

OAuth token、Client Secret、暗号鍵などの秘密値は監査ログへ保存しません。

## 価格ルール

- `sales_price`だけを変更します。
- 予約価格は整数円、100円以上です。
- 割引率は1〜99%です。
- 割引計算は`floor(current_price * (100 - rate) / 100)`です。
- 予約作成時とPreview時にバリエーション有無、価格下限、予約重複を検証します。
