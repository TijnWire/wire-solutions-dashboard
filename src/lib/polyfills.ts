// Kleine aanvullingen voor oudere browsers (o.a. Safari op macOS/iOS vóór 17.4). pdf.js gebruikt deze
// functies; zonder ze faalt het uitlezen van een PDF met "Kon de PDF niet lezen". Wordt geladen in de
// app én in de PDF-worker (zie pdfWorker.ts). Alleen toevoegen wat ontbreekt.
/* eslint-disable @typescript-eslint/no-explicit-any */
const P = Promise as any;
if (typeof P.withResolvers !== "function") {
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (e?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
if (typeof P.try !== "function") {
  P.try = function (fn: (...a: unknown[]) => unknown, ...args: unknown[]) {
    return new Promise((res) => res(fn(...args)));
  };
}
const M = Map as any;
if (typeof M.groupBy !== "function") {
  M.groupBy = function <K, V>(items: Iterable<V>, key: (v: V, i: number) => K) {
    const m = new Map<K, V[]>();
    let i = 0;
    for (const v of items) { const k = key(v, i++); const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); }
    return m;
  };
}
const O = Object as any;
if (typeof O.groupBy !== "function") {
  O.groupBy = function <V>(items: Iterable<V>, key: (v: V, i: number) => PropertyKey) {
    const o: Record<PropertyKey, V[]> = Object.create(null);
    let i = 0;
    for (const v of items) { const k = key(v, i++); (o[k] ??= []).push(v); }
    return o;
  };
}
const U8 = Uint8Array as any;
if (typeof U8.prototype.toHex !== "function") {
  U8.prototype.toHex = function (this: Uint8Array) {
    let s = "";
    for (let i = 0; i < this.length; i++) s += this[i].toString(16).padStart(2, "0");
    return s;
  };
}
if (typeof U8.prototype.toBase64 !== "function") {
  U8.prototype.toBase64 = function (this: Uint8Array) {
    let s = "";
    for (let i = 0; i < this.length; i += 0x8000) s += String.fromCharCode(...this.subarray(i, i + 0x8000));
    return btoa(s);
  };
}
if (typeof U8.fromBase64 !== "function") {
  U8.fromBase64 = function (s: string) {
    const b = atob(s.replace(/[\s]/g, ""));
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  };
}
if (typeof U8.fromHex !== "function") {
  U8.fromHex = function (s: string) {
    const u = new Uint8Array(s.length >> 1);
    for (let i = 0; i < u.length; i++) u[i] = parseInt(s.substr(i * 2, 2), 16);
    return u;
  };
}
const MA = Math as any;
if (typeof MA.sumPrecise !== "function") {
  MA.sumPrecise = function (items: Iterable<number>) { let t = 0; for (const x of items) t += x; return t; };
}
const R = RegExp as any;
if (typeof R.escape !== "function") {
  R.escape = function (s: string) { return String(s).replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&"); };
}
const E = Error as any;
if (typeof E.isError !== "function") {
  E.isError = function (v: unknown) { return v instanceof Error || Object.prototype.toString.call(v) === "[object Error]"; };
}
const A = Array as any;
if (typeof A.fromAsync !== "function") {
  A.fromAsync = async function (items: AsyncIterable<unknown> | Iterable<unknown>, map?: (v: unknown, i: number) => unknown) {
    const uit: unknown[] = [];
    let i = 0;
    for await (const v of items as AsyncIterable<unknown>) uit.push(map ? await map(v, i++) : v);
    return uit;
  };
}
const SP = Set.prototype as any;
if (typeof SP.union !== "function") SP.union = function (this: Set<unknown>, o: Iterable<unknown>) { const s = new Set(this); for (const v of (o as any).keys ? (o as any).keys() : o) s.add(v); return s; };
if (typeof SP.intersection !== "function") SP.intersection = function (this: Set<unknown>, o: { has(v: unknown): boolean }) { const s = new Set(); for (const v of this) if (o.has(v)) s.add(v); return s; };
if (typeof SP.difference !== "function") SP.difference = function (this: Set<unknown>, o: { has(v: unknown): boolean }) { const s = new Set(); for (const v of this) if (!o.has(v)) s.add(v); return s; };
if (typeof SP.isSubsetOf !== "function") SP.isSubsetOf = function (this: Set<unknown>, o: { has(v: unknown): boolean }) { for (const v of this) if (!o.has(v)) return false; return true; };
export {};
