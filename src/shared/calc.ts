/**
 * A small, safe calculator for the address bar: + − × ÷ ^ %, brackets, decimals,
 * pi/e and a few functions (sqrt, sin, cos, tan, log, ln, abs, round). No eval.
 * Returns null for anything that isn't clearly a sum, so normal searches aren't hijacked.
 */
const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
  log: Math.log10,
  ln: Math.log,
  abs: Math.abs,
  round: Math.round
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

export function calculate(input: string): number | null {
  const src = input
    .trim()
    .replace(/^=/, '')
    .toLowerCase()
    .replace(/×|x(?=\s*[\d(.])/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/,/g, '')
  // Needs at least one operator or function between numbers; plain numbers and words aren't sums.
  if (!/^[\d\s.+\-*/^%()a-z]+$/.test(src) || !/\d/.test(src)) return null
  if (!/[+\-*/^%]|[a-z]+\s*\(/.test(src.replace(/^-/, ''))) return null

  const tokens = src.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|[+\-*/^%()]/g)
  if (!tokens || tokens.join('') !== src.replace(/\s+/g, '')) return null
  let i = 0
  const peek = (): string | undefined => tokens[i]
  const next = (): string | undefined => tokens[i++]

  // Grammar: expr = term (('+'|'-') term)*; term = power (('*'|'/'|'%') power)*;
  // power = unary ('^' power)?; unary = '-' unary | atom; atom = number | const | func '(' expr ')' | '(' expr ')'
  function expr(): number {
    let v = term()
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + term() : v - term()
    return v
  }
  function term(): number {
    let v = power()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next()
      // "50%" on its own means 0.5; "10 % 3" is the remainder.
      if (op === '%' && (peek() === undefined || peek() === ')' || peek() === '+' || peek() === '-')) v = v / 100
      else v = op === '*' ? v * power() : op === '/' ? v / power() : v % power()
    }
    return v
  }
  function power(): number {
    const base = unary()
    return peek() === '^' ? (next(), Math.pow(base, power())) : base
  }
  function unary(): number {
    if (peek() === '-') return next(), -unary()
    if (peek() === '+') return next(), unary()
    return atom()
  }
  function atom(): number {
    const t = next()
    if (t === undefined) throw new Error('end')
    if (t === '(') {
      const v = expr()
      if (next() !== ')') throw new Error(')')
      return v
    }
    if (/^[\d.]/.test(t)) return parseFloat(t)
    if (t in CONSTS) return CONSTS[t]
    if (t in FUNCS && peek() === '(') {
      next()
      const v = expr()
      if (next() !== ')') throw new Error(')')
      return FUNCS[t](v)
    }
    throw new Error(t)
  }

  try {
    const v = expr()
    if (i !== tokens.length || !Number.isFinite(v)) return null
    return v
  } catch {
    return null
  }
}

/** 576 → "576", 0.1+0.2 → "0.3", 1e21 → "1e+21". */
export function formatAnswer(v: number): string {
  if (Math.abs(v) >= 1e15 || (v !== 0 && Math.abs(v) < 1e-6)) return v.toPrecision(10).replace(/\.?0+e/, 'e')
  return String(Math.round(v * 1e10) / 1e10)
}
