import type { ErrorCode } from "./domain";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: "入力内容を確認してください。",
  PRODUCT_NOT_FOUND: "商品を取得できませんでした。",
  PRODUCT_HAS_VARIANTS: "バリエーション商品はMVPの対象外です。",
  PRICE_TOO_LOW: "セール価格がカラーミーショップの最低価格を下回っています。",
  PRICE_NOT_INTEGER: "セール価格は整数円で指定してください。",
  SCHEDULE_OVERLAP: "同じ商品に重複する予約があります。期間を変更してください。",
  SCHEDULE_ENDED_BEFORE_START: "開始時刻より前に終了時刻を過ぎているため、価格を変更しませんでした。",
  CONFLICT: "セール中に価格が変更されたため、安全のため元価格へ戻していません。",
  VERIFY_UNKNOWN: "価格変更後の反映を確認できませんでした。追加の価格変更は行っていません。",
  POST_WRITE_DIVERGENCE: "価格変更後に予期しない価格が確認されました。追加の価格変更は行っていません。",
  COLORME_RATE_LIMIT: "カラーミーショップAPIの利用上限に達しました。時間をおいて再試行します。",
  COLORME_TEMPORARY_ERROR: "カラーミーショップ側で一時的なエラーが発生しました。時間をおいて再試行します。",
  COLORME_AUTH_ERROR: "カラーミーショップとの認可が必要です。",
  COLORME_VALIDATION_ERROR: "カラーミーショップが価格変更を受け付けませんでした。",
  INTERNAL_ERROR: "処理結果を確認できませんでした。時間をおいて再試行してください。"
};

export function userFacingError(code: ErrorCode | null, fallback?: string): string {
  return (code && ERROR_MESSAGES[code]) || fallback || ERROR_MESSAGES.INTERNAL_ERROR;
}
