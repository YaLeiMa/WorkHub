import { normalizeHex } from "@/lib/workhub/colorUtils";
import type { ToolCopyLine } from "../types";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clampHue(n: number): number {
  const h = n % 360;
  return h < 0 ? h + 360 : h;
}

export function hexToRgb(hex: string): Rgb {
  const body = hex.slice(1);
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;

  return {
    h: Math.round(clampHue(h)),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  if (sn === 0) {
    const v = clampByte(ln * 255);
    return { r: v, g: v, b: v };
  }

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hk = h / 360;

  const hueToRgb = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };

  return {
    r: clampByte(hueToRgb(hk + 1 / 3) * 255),
    g: clampByte(hueToRgb(hk) * 255),
    b: clampByte(hueToRgb(hk - 1 / 3) * 255),
  };
}

function parseRgbTriplet(r: string, g: string, b: string): Rgb | null {
  const rn = Number(r);
  const gn = Number(g);
  const bn = Number(b);
  if (![rn, gn, bn].every((n) => Number.isFinite(n))) return null;
  if ([rn, gn, bn].some((n) => n < 0 || n > 255)) return null;
  return { r: rn, g: gn, b: bn };
}

/** 解析 HEX / RGB / HSL 输入，失败返回 null */
export function parseColorInput(input: string): Rgb | null {
  const raw = input.trim();
  if (!raw) return null;

  const hex = normalizeHex(raw);
  if (hex) return hexToRgb(hex);

  const rgbFn = raw.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );
  if (rgbFn) return parseRgbTriplet(rgbFn[1], rgbFn[2], rgbFn[3]);

  const hslFn = raw.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );
  if (hslFn) {
    const h = Number(hslFn[1]);
    const s = Number(hslFn[2]);
    const l = Number(hslFn[3]);
    if (![h, s, l].every((n) => Number.isFinite(n))) return null;
    if (s < 0 || s > 100 || l < 0 || l > 100) return null;
    return hslToRgb({ h: clampHue(h), s, l });
  }

  const parts = raw.split(/[\s,，/]+/).filter(Boolean);
  if (parts.length === 3 && parts.every((p) => /^\d{1,3}$/.test(p))) {
    return parseRgbTriplet(parts[0], parts[1], parts[2]);
  }

  return null;
}

export function formatColorItems(rgb: Rgb): ToolCopyLine[] {
  const hex = rgbToHex(rgb);
  const hsl = rgbToHsl(rgb);
  return [
    { label: "HEX", value: hex },
    { label: "RGB", value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    { label: "HSL", value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
  ];
}
