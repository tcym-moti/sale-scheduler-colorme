"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Product = { id: number; name: string; salesPrice: number | null; variantCount: number };
type PreviewItem = { productId: number; productName: string; currentPrice: number | null; scheduledPrice: number | null; discountAmount: number | null; discountRate: number | null; valid: boolean; errorCode: string | null; errorMessage: string | null };
type Preview = { pricingMode: "FIXED" | "DISCOUNT_RATE"; value: number; startAt: string; endAt: string; estimatedStartSeconds: number; estimatedEndSeconds: number; items: PreviewItem[]; valid: boolean };
type Schedule = { id: string; status: string; pricingMode: string; pricingValue: number; startAt: string; endAt: string; itemCount: number; completedCount: number; activeCount: number; failedCount: number; conflictCount: number; createdAt: string };
type Detail = Schedule & { items: Array<{ id: string; productId: number; productName: string; originalPrice: number | null; effectiveOriginalPrice: number | null; scheduledPrice: number; currentPrice: number | null; status: string; conflictReason: string | null; lastError: string | null; retryCount: number }> };

const yen = (value: number | null) => value === null ? "—" : `${value.toLocaleString("ja-JP")}円`;
const dateTime = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const duration = (seconds: number) => {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `約${seconds}秒`;
  return `約${Math.ceil(seconds / 60)}分`;
};
const localInput = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
};
const jstInputToIso = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "";
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]) - 9, Number(match[5]))).toISOString();
};
const statusLabel: Record<string, string> = { SCHEDULED: "予約中", STARTING: "開始処理中", ACTIVE: "実施中", ENDING: "終了処理中", COMPLETED: "完了", PARTIAL: "一部完了", CONFLICT: "Conflict", VERIFY_PENDING: "確認中", VERIFY_UNKNOWN: "確認不能", POST_WRITE_DIVERGENCE: "書込後不一致", FAILED: "失敗", CANCELLED: "キャンセル" };
const statusClass = (status: string) => status === "COMPLETED" ? "success" : ["CONFLICT", "FAILED", "PARTIAL", "VERIFY_UNKNOWN", "POST_WRITE_DIVERGENCE"].includes(status) ? "danger" : ["SCHEDULED", "STARTING", "ACTIVE", "ENDING", "VERIFY_PENDING"].includes(status) ? "warning" : "";

function csrfToken(): string {
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("sale-scheduler-csrf="))?.split("=").slice(1).join("=") ?? "";
}

export default function Dashboard({ shopName, accountId }: { shopName: string; accountId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [mode, setMode] = useState<"FIXED" | "DISCOUNT_RATE">("FIXED");
  const [value, setValue] = useState("1000");
  const [startAt, setStartAt] = useState(() => localInput(new Date(Date.now() + 10 * 60_000)));
  const [endAt, setEndAt] = useState(() => localInput(new Date(Date.now() + 20 * 60_000)));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProducts = useMemo(() => products.filter((product) => selected.includes(product.id)), [products, selected]);
  const totals = useMemo(() => ({ scheduled: schedules.filter((item) => item.status === "SCHEDULED").length, active: schedules.filter((item) => ["STARTING", "ACTIVE", "ENDING"].includes(item.status)).length, completed: schedules.filter((item) => item.status === "COMPLETED").length, conflict: schedules.filter((item) => item.status === "CONFLICT").length, failed: schedules.filter((item) => ["FAILED", "PARTIAL"].includes(item.status)).length }), [schedules]);

  async function loadProducts(search = query) {
    setBusy(true); setError(null);
    try { const response = await fetch(`/api/products/search?q=${encodeURIComponent(search)}`); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "商品を取得できませんでした。"); setProducts(body.products); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "商品を取得できませんでした。"); }
    finally { setBusy(false); }
  }
  async function loadSchedules() {
    try { const response = await fetch("/api/schedules"); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "履歴を取得できませんでした。"); setSchedules(body.schedules); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "履歴を取得できませんでした。"); }
  }
  useEffect(() => { void fetch("/api/csrf").then(() => Promise.all([loadProducts(""), loadSchedules()])); }, []);

  function body() {
    return { productIds: selected, pricingMode: mode, pricingValue: Number(value), startAt: jstInputToIso(startAt), endAt: jstInputToIso(endAt) };
  }
  async function requestPreview() {
    setBusy(true); setError(null); setMessage(null);
    try { const response = await fetch("/api/schedules/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body()) }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "Previewを作成できませんでした。"); setPreview(result.preview); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Previewを作成できませんでした。"); }
    finally { setBusy(false); }
  }
  async function confirmSchedule() {
    if (!preview?.valid) return;
    setBusy(true); setError(null); setMessage(null);
    try { const response = await fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() }, body: JSON.stringify(body()) }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "予約を作成できませんでした。"); setMessage("予約を作成しました。Workerが指定日時に処理します。"); setPreview(null); setSelected([]); await loadSchedules(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "予約を作成できませんでした。"); }
    finally { setBusy(false); }
  }
  async function scheduleAction(id: string, action: "cancel" | "retry") {
    setBusy(true); setError(null); setMessage(null);
    try { const response = await fetch(`/api/schedules/${id}/${action}`, { method: "POST", headers: { "x-csrf-token": csrfToken() } }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "操作に失敗しました。"); setMessage(action === "cancel" ? "操作を受け付けました。開始前はキャンセル、開始後は安全な終了処理になります。" : `${result.retried ?? 0}件の失敗項目を再実行します。`); await loadSchedules(); if (detail?.id === id) await openDetail(id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作に失敗しました。"); }
    finally { setBusy(false); }
  }
  async function openDetail(id: string) {
    try { const response = await fetch(`/api/schedules/${id}`); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "詳細を取得できませんでした。"); setDetail(result.schedule); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "詳細を取得できませんでした。"); }
  }
  async function logout() {
    setBusy(true);
    try { const response = await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrfToken() } }); if (response.ok) window.location.href = "/"; else setError("ログアウトに失敗しました。"); }
    finally { setBusy(false); }
  }

  return <div className="shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">SS</div><div><h1>Sale Scheduler</h1><p>安全なセール価格スケジューラー</p></div></div><div className="account"><span><strong>{shopName}</strong><br />Account ID: {accountId}</span><button className="button small" onClick={() => void logout()} disabled={busy}>ログアウト</button></div></header>
    <main className="main">
      <section className="hero"><div><h2>セール予約</h2><p>価格を変更する商品と期間を指定し、実行前に内容を確認できます。</p></div></section>
      {message && <p className="notice">{message}</p>}{error && <p className="error">{error}</p>}
      <section className="stats"><div className="card stat"><span>予約中</span><strong>{totals.scheduled}</strong></div><div className="card stat warning"><span>実施中</span><strong>{totals.active}</strong></div><div className="card stat success"><span>完了</span><strong>{totals.completed}</strong></div><div className="card stat danger"><span>Conflict</span><strong>{totals.conflict}</strong></div><div className="card stat danger"><span>失敗・一部完了</span><strong>{totals.failed}</strong></div></section>
      <section className="workspace">
        <section className="card"><div className="card-heading"><h3>1. 商品を選択</h3><span className="help">{selected.length}件選択中</span></div><div className="card-body"><form className="search" onSubmit={(event) => { event.preventDefault(); void loadProducts(); }}><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="商品名・商品IDで検索" /><button className="button" disabled={busy}>検索</button></form><p className="help">バリエーション商品はMVPの対象外です。商品を選択すると、現在の販売価格を確認できます。</p><div className="product-list">{products.length === 0 ? <div className="empty">商品がありません。</div> : products.map((product) => { const disabled = product.variantCount > 0 || product.salesPrice === null; return <label className={`product-row ${disabled ? "disabled" : ""}`} key={product.id}><input type="checkbox" disabled={disabled} checked={selected.includes(product.id)} onChange={() => setSelected((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} /><div><div className="product-name">{product.name}</div><div className="product-meta">ID: {product.id}{product.variantCount > 0 ? " · バリエーションあり（対象外）" : ""}</div></div><div className="price">{yen(product.salesPrice)}</div></label>; })}</div></div></section>
       <section className="card"><div className="card-heading"><h3>2. セールを設定</h3><span className="help">JST</span></div><div className="card-body"><div className="form-grid"><div className="field full"><label>価格方式</label><div className="radio-group"><label className={`radio ${mode === "FIXED" ? "selected" : ""}`}><input type="radio" checked={mode === "FIXED"} onChange={() => setMode("FIXED")} />価格を指定</label><label className={`radio ${mode === "DISCOUNT_RATE" ? "selected" : ""}`}><input type="radio" checked={mode === "DISCOUNT_RATE"} onChange={() => setMode("DISCOUNT_RATE")} />割引率を指定</label></div></div><div className="field full"><label htmlFor="pricing-value">{mode === "FIXED" ? "セール価格（円）" : "割引率（% OFF）"}</label><input id="pricing-value" className="input" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} /><span className="help">{mode === "FIXED" ? "100円以上の整数で指定してください。" : "1〜99%の整数。各商品の現在価格から端数切り捨てで算出します。"}</span></div><div className="field"><label htmlFor="start-at">開始日時（JST）</label><input id="start-at" className="input" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></div><div className="field"><label htmlFor="end-at">終了日時（JST）</label><input id="end-at" className="input" type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></div></div><p className="sequence-note">指定した開始日時から順次価格を変更します。終了時も商品ごとに順次元価格へ戻します。API制限により、全商品が同じ秒に反映されるとは限りません。</p><div className="actions"><button className="button primary" disabled={busy || selectedProducts.length === 0} onClick={() => void requestPreview()}>Previewを表示</button></div>{preview && <div className="preview"><h4>実行前Preview</h4><p className="help">指定した開始日時から順次反映します。{dateTime(preview.startAt)}開始 → {dateTime(preview.endAt)}終了。</p><div className="estimate-grid"><div><span>対象商品</span><strong>{preview.items.length}件</strong></div><div><span>開始予定</span><strong>{dateTime(preview.startAt)}</strong></div><div><span>終了予定</span><strong>{dateTime(preview.endAt)}</strong></div><div><span>開始処理の概算</span><strong>{duration(preview.estimatedStartSeconds)}</strong></div><div><span>終了処理の概算</span><strong>{duration(preview.estimatedEndSeconds)}</strong></div></div><p className="estimate-note">API制限により順次反映されます。表示時間は現在のRate Limitと最低限のAPI呼び出し数から算出した概算で、verification retryや一時的なAPIエラーにより延長する場合があります。</p><div className="table-wrap"><table><thead><tr><th>商品</th><th className="num">現在価格</th><th className="num">セール価格</th><th className="num">値引額</th><th>結果</th></tr></thead><tbody>{preview.items.map((item) => <tr key={item.productId}><td>{item.productName}</td><td className="num">{yen(item.currentPrice)}</td><td className="num">{yen(item.scheduledPrice)}</td><td className="num">{yen(item.discountAmount)}</td><td className={item.valid ? "valid" : "invalid"}>{item.valid ? "登録可能" : item.errorMessage}</td></tr>)}</tbody></table></div><div className="actions"><button className="button" onClick={() => setPreview(null)}>戻る</button><button className="button primary" disabled={busy || !preview.valid} onClick={() => void confirmSchedule()}>予約を確定</button></div></div>}</div></section>
      </section>
      <section className="card" style={{ marginTop: 18 }}><div className="card-heading"><h3>予約一覧</h3><button className="button small" onClick={() => void loadSchedules()} disabled={busy}>更新</button></div><div className="card-body"><div className="schedule-list">{schedules.length === 0 ? <div className="empty">まだ予約はありません。</div> : schedules.map((schedule) => <article className="schedule-card" key={schedule.id}><div className="schedule-card-head"><div><h4>{dateTime(schedule.startAt)}〜{dateTime(schedule.endAt)}</h4><p>{schedule.itemCount}商品 · {schedule.pricingMode === "FIXED" ? `${yen(schedule.pricingValue)}指定` : `${schedule.pricingValue}% OFF`} · 成功 {schedule.completedCount} / 実施中 {schedule.activeCount} / 失敗 {schedule.failedCount} / Conflict {schedule.conflictCount}</p></div><span className={`status ${statusClass(schedule.status)}`}>{statusLabel[schedule.status] ?? schedule.status}</span></div><div className="schedule-actions"><button className="button small" onClick={() => void openDetail(schedule.id)}>詳細</button>{["SCHEDULED", "ACTIVE", "PARTIAL", "CONFLICT", "ENDING"].includes(schedule.status) && <button className="button small" onClick={() => void scheduleAction(schedule.id, "cancel")} disabled={busy}>{schedule.status === "SCHEDULED" ? "キャンセル" : "終了して復元"}</button>}{["FAILED", "PARTIAL"].includes(schedule.status) && <button className="button small" onClick={() => void scheduleAction(schedule.id, "retry")} disabled={busy}>失敗を再実行</button>}</div></article>)}</div></div></section>
      {detail && <section className="card" style={{ marginTop: 18 }}><div className="card-heading"><h3>予約の詳細</h3><button className="button small" onClick={() => setDetail(null)}>閉じる</button></div><div className="card-body"><p className="help">{dateTime(detail.startAt)}〜{dateTime(detail.endAt)} · {statusLabel[detail.status] ?? detail.status}</p><div className="table-wrap"><table><thead><tr><th>商品</th><th>状態</th><th className="num">元価格</th><th className="num">セール価格</th><th className="num">現在価格</th><th>理由</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.id}><td>{item.productName}<div className="product-meta">ID: {item.productId}</div></td><td><span className={`status ${statusClass(item.status)}`}>{statusLabel[item.status] ?? item.status}</span></td><td className="num">{yen(item.effectiveOriginalPrice ?? item.originalPrice)}</td><td className="num">{yen(item.scheduledPrice)}</td><td className="num">{yen(item.currentPrice)}</td><td>{item.conflictReason ?? item.lastError ?? "—"}</td></tr>)}</tbody></table></div></div></section>}
      <p className="footer-note">価格変更の監査ログを保存します。Conflict時は商品価格を変更せず、人間の確認を待ちます。</p><nav className="app-links" aria-label="関連ページ"><Link href="/manual">使い方</Link><Link href="/terms">利用規約</Link><Link href="/privacy">プライバシー</Link><Link href="/support">サポート</Link></nav>
    </main>
  </div>;
}
