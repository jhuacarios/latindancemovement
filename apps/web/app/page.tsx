import type { Metadata } from 'next';
import { Landing } from './landing';

export const metadata: Metadata = {
  title: 'Nectason — El ecosistema del baile social latino',
  description:
    'Bachata y salsa: descubre lo nuevo que suena, arma tus playlists con inteligencia y conoce a cada artista de la escena.',
};

/**
 * Landing público del sitio (ruta "/"). Se renderiza como HTML tal cual (es
 * contenido de marketing estático, sin input de usuario), para no depender de la
 * app autenticada. El panel vive en /inicio y detrás.
 */
const LANDING_HTML = `
<style>
  .ncta-root {
    --selva: #0d1f1a; --selva-2: #081512; --surface: #12271e; --surface-2: #0f2019;
    --line: #244536; --line-soft: #1c3a2d;
    --son: #1a7a4e; --clave: #4ec990; --nectar: #b6f0d0; --sabor: #e8f5e2;
    --muted: #7baf8e; --muted-2: #5b8a70; --bachata: #f59e0b; --salsa: #ef4444; --epica: #b06cf0;
    --font: var(--font-jakarta), "Segoe UI", -apple-system, system-ui, sans-serif;
    background: var(--selva); color: var(--sabor); font-family: var(--font);
    line-height: 1.5; -webkit-font-smoothing: antialiased; overflow-x: hidden; display: block;
  }
  .ncta-root * { box-sizing: border-box; }
  .ncta-root .wrap { width: min(1120px, 92vw); margin-inline: auto; }

  .ncta-root .topbar { position: sticky; top: 0; z-index: 50; padding: 14px 0;
    background: color-mix(in srgb, var(--selva) 82%, transparent); backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line-soft); }
  .ncta-root .topbar .row { display: flex; align-items: center; justify-content: space-between; width: min(1120px, 92vw); margin-inline: auto; }
  .ncta-root .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -0.02em; }
  .ncta-root .brand .mark { width: 30px; height: 30px; border-radius: 9px;
    background: radial-gradient(120% 120% at 30% 20%, var(--clave), var(--son) 70%);
    display: grid; place-items: center; color: #06140e; font-size: 18px;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--clave) 40%, transparent), 0 6px 18px -8px var(--son); }
  .ncta-root .brand .word { font-size: 20px; }
  .ncta-root .brand .word b { color: var(--clave); font-weight: 800; }
  .ncta-root .topbar .right { display: flex; align-items: center; gap: 14px; }
  .ncta-root .topbar .tag { font-size: 12.5px; color: var(--muted); letter-spacing: 0.02em; }
  @media (max-width: 640px) { .ncta-root .topbar .tag { display: none; } }

  .ncta-root .hero { position: relative; padding: clamp(56px, 11vw, 120px) 0 clamp(44px, 8vw, 92px); }
  .ncta-root .hero::before, .ncta-root .hero::after { content: ""; position: absolute; z-index: 0; filter: blur(70px); opacity: .5; pointer-events: none; }
  .ncta-root .hero::before { width: 520px; height: 520px; top: -120px; right: -80px; background: radial-gradient(circle, color-mix(in srgb, var(--bachata) 55%, transparent), transparent 62%); }
  .ncta-root .hero::after { width: 480px; height: 480px; bottom: -160px; left: -120px; background: radial-gradient(circle, color-mix(in srgb, var(--salsa) 42%, transparent), transparent 62%); }
  .ncta-root .hero .inner { position: relative; z-index: 1; max-width: 760px; }
  .ncta-root .eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; color: var(--nectar); border: 1px solid var(--line); border-radius: 999px; padding: 6px 13px; background: color-mix(in srgb, var(--son) 12%, transparent); }
  .ncta-root .eyebrow .dot-b { width: 7px; height: 7px; border-radius: 50%; background: var(--bachata); }
  .ncta-root .eyebrow .dot-s { width: 7px; height: 7px; border-radius: 50%; background: var(--salsa); }
  .ncta-root h1 { font-size: clamp(38px, 8.4vw, 80px); line-height: 0.98; letter-spacing: -0.035em; font-weight: 800; margin: 22px 0 0; text-wrap: balance; }
  .ncta-root h1 .heat { background: linear-gradient(96deg, var(--bachata), var(--salsa)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .ncta-root .lede { font-size: clamp(17px, 2.4vw, 21px); color: var(--muted); max-width: 60ch; margin: 22px 0 0; }
  .ncta-root .lede b { color: var(--sabor); font-weight: 600; }
  .ncta-root .hero-cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
  .ncta-root .btn { display: inline-flex; align-items: center; gap: 8px; font-weight: 650; font-size: 15px; padding: 12px 20px; border-radius: 12px; text-decoration: none; cursor: pointer; border: 1px solid transparent; }
  .ncta-root .btn.primary { background: var(--son); color: #fff; box-shadow: 0 10px 26px -12px var(--son); }
  .ncta-root .btn.primary:hover { background: #1f8c5a; }
  .ncta-root .btn.ghost { border-color: var(--line); color: var(--sabor); }
  .ncta-root .btn.ghost:hover { background: var(--surface); }
  .ncta-root .btn.sm { padding: 8px 16px; font-size: 14px; }

  .ncta-root .stats { display: flex; flex-wrap: wrap; gap: 28px; margin-top: 44px; }
  .ncta-root .stat .n { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .ncta-root .stat .n.b { color: var(--bachata); } .ncta-root .stat .n.s { color: var(--salsa); } .ncta-root .stat .n.g { color: var(--clave); }
  .ncta-root .stat .l { font-size: 12.5px; color: var(--muted); letter-spacing: 0.04em; }

  .ncta-root .feature { padding: clamp(52px, 9vw, 100px) 0; border-top: 1px solid var(--line-soft); }
  .ncta-root .feature .grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: clamp(32px, 6vw, 80px); align-items: center; }
  .ncta-root .feature.alt .grid { grid-template-columns: 0.95fr 1.05fr; }
  .ncta-root .feature.alt .copy { order: 2; }
  @media (max-width: 860px) { .ncta-root .feature .grid, .ncta-root .feature.alt .grid { grid-template-columns: 1fr; gap: 40px; } .ncta-root .feature.alt .copy { order: 0; } .ncta-root .stage { order: 2; } }

  .ncta-root .kicker { font-size: 12.5px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; }
  .ncta-root .kicker.b { color: var(--bachata); } .ncta-root .kicker.s { color: var(--salsa); } .ncta-root .kicker.g { color: var(--clave); }
  .ncta-root .feature h2 { font-size: clamp(28px, 4.6vw, 44px); letter-spacing: -0.03em; line-height: 1.04; margin: 14px 0 0; text-wrap: balance; }
  .ncta-root .feature p { color: var(--muted); font-size: 16.5px; max-width: 46ch; margin: 16px 0 0; }
  .ncta-root .feature p b { color: var(--sabor); font-weight: 600; }
  .ncta-root .bullets { list-style: none; padding: 0; margin: 22px 0 0; display: grid; gap: 11px; }
  .ncta-root .bullets li { display: flex; gap: 11px; align-items: flex-start; font-size: 15px; color: var(--nectar); }
  .ncta-root .bullets svg { flex: none; margin-top: 3px; }

  .ncta-root .stage { display: flex; justify-content: center; }
  .ncta-root .phone { width: 300px; flex: none; border-radius: 42px; padding: 9px; background: linear-gradient(160deg, #1d332a, #0c1a15); box-shadow: 0 40px 80px -30px rgba(0,0,0,.8), 0 0 0 1px var(--line-soft), inset 0 1px 0 rgba(255,255,255,.05); }
  .ncta-root .screen { position: relative; border-radius: 34px; overflow: hidden; background: var(--selva); aspect-ratio: 9 / 19.3; padding: 16px 13px 14px; border: 1px solid #17342780; }
  .ncta-root .screen::before { content: ""; position: absolute; top: 9px; left: 50%; transform: translateX(-50%); width: 92px; height: 6px; border-radius: 999px; background: #0a1712; }
  .ncta-root .s-head { display: flex; align-items: center; gap: 7px; margin: 14px 2px 12px; }
  .ncta-root .s-head .m { width: 18px; height: 18px; border-radius: 6px; background: radial-gradient(120% 120% at 30% 20%, var(--clave), var(--son) 70%); }
  .ncta-root .s-head .w { font-weight: 800; font-size: 13px; letter-spacing: -0.02em; }
  .ncta-root .s-head .w b { color: var(--clave); }
  .ncta-root .s-title { font-size: 19px; font-weight: 800; letter-spacing: -0.02em; margin: 0 2px 3px; }
  .ncta-root .s-sub { font-size: 10.5px; color: var(--muted); margin: 0 2px 12px; }
  .ncta-root .sec-h { font-size: 11.5px; font-weight: 700; margin: 14px 2px 8px; }
  .ncta-root .sec-h.b { color: var(--bachata); } .ncta-root .sec-h.s { color: var(--salsa); }
  .ncta-root .row { display: flex; align-items: center; gap: 8px; padding: 6px 3px; }
  .ncta-root .row + .row { border-top: 1px solid #16302480; }
  .ncta-root .rank { width: 10px; text-align: right; font-size: 10px; color: var(--muted-2); font-variant-numeric: tabular-nums; }
  .ncta-root .cov { width: 34px; height: 34px; border-radius: 6px; flex: none; }
  .ncta-root .cov.a { background: linear-gradient(135deg, #7a3b12, #241009); }
  .ncta-root .cov.b { background: linear-gradient(135deg, #3a1414, #1a0a0a); }
  .ncta-root .cov.c { background: linear-gradient(135deg, #123a2b, #06150f); }
  .ncta-root .cov.d { background: linear-gradient(135deg, #2a2140, #120c1f); }
  .ncta-root .meta { min-width: 0; flex: 1; }
  .ncta-root .t { font-size: 11.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ncta-root .ar { font-size: 10.5px; font-weight: 700; color: var(--clave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ncta-root .pills { display: flex; gap: 4px; margin-top: 3px; align-items: center; flex-wrap: wrap; }
  .ncta-root .pill { font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 999px; white-space: nowrap; }
  .ncta-root .pill.bach { background: color-mix(in srgb, var(--bachata) 16%, transparent); color: var(--bachata); }
  .ncta-root .pill.sal { background: color-mix(in srgb, var(--salsa) 16%, transparent); color: #fca5a5; }
  .ncta-root .pill.epica { background: linear-gradient(90deg, #8b3fd6, #c56bf0); color: #fff; text-transform: uppercase; box-shadow: 0 0 9px -1px color-mix(in srgb, var(--epica) 75%, transparent); animation: ncta-glow 3.2s ease-in-out infinite; }
  @keyframes ncta-glow { 0%,100% { box-shadow: 0 0 8px -2px color-mix(in srgb, var(--epica) 60%, transparent);} 50% { box-shadow: 0 0 15px 0 color-mix(in srgb, var(--epica) 85%, transparent);} }
  .ncta-root .pill.nueva { background: linear-gradient(90deg, #10b981, #34d399); color: #06140e; text-transform: uppercase; }
  .ncta-root .pill.cat { background: color-mix(in srgb, #38bdf8 15%, transparent); color: #7dd3fc; }
  .ncta-root .pill.lib { background: color-mix(in srgb, var(--clave) 15%, transparent); color: var(--clave); }
  .ncta-root .vpd { font-size: 9px; color: var(--muted); white-space: nowrap; }
  .ncta-root .play { width: 20px; height: 20px; border-radius: 50%; background: #17322650; border: 1px solid var(--line-soft); display: grid; place-items: center; color: var(--nectar); font-size: 8px; flex: none; }
  .ncta-root .counters { display: flex; gap: 8px; margin: 4px 2px 10px; }
  .ncta-root .counter { display: flex; align-items: center; gap: 6px; border-radius: 9px; padding: 6px 11px; border: 1px solid; }
  .ncta-root .counter.b { border-color: color-mix(in srgb, var(--bachata) 30%, transparent); background: color-mix(in srgb, var(--bachata) 9%, transparent); }
  .ncta-root .counter.s { border-color: color-mix(in srgb, var(--salsa) 30%, transparent); background: color-mix(in srgb, var(--salsa) 9%, transparent); }
  .ncta-root .counter .cn { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .ncta-root .counter.b .cn { color: var(--bachata); } .ncta-root .counter.s .cn { color: #fca5a5; }
  .ncta-root .counter .cl { font-size: 9.5px; color: var(--muted); }
  .ncta-root .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 2px 4px; }
  .ncta-root .chip { font-size: 8.5px; padding: 3px 7px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line-soft); color: var(--nectar); white-space: nowrap; }
  .ncta-root .chip b { color: var(--clave); font-weight: 700; }
  .ncta-root .search { display: flex; align-items: center; gap: 7px; border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; margin: 0 2px 12px; color: var(--muted-2); font-size: 11px; }
  .ncta-root .arow { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--line-soft); border-radius: 8px; padding: 8px 10px; margin: 0 2px 6px; }
  .ncta-root .arow .an { font-size: 11.5px; font-weight: 600; }
  .ncta-root .arow .aside { display: flex; align-items: center; gap: 6px; }
  .ncta-root .sq { width: 15px; height: 15px; border-radius: 5px; display: grid; place-items: center; font-size: 8px; font-weight: 800; }
  .ncta-root .sq.b { background: color-mix(in srgb, var(--bachata) 16%, transparent); color: var(--bachata); }
  .ncta-root .sq.s { background: color-mix(in srgb, var(--salsa) 16%, transparent); color: #fca5a5; }
  .ncta-root .ac { font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .ncta-root .cand { display: flex; gap: 8px; border: 1px solid var(--line-soft); border-radius: 10px; padding: 8px; margin: 0 2px 7px; }
  .ncta-root .cand .thumb { width: 46px; height: 32px; border-radius: 5px; flex: none; }
  .ncta-root .conf { font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 999px; text-transform: uppercase; }
  .ncta-root .conf.alta { background: color-mix(in srgb, var(--clave) 16%, transparent); color: var(--clave); }
  .ncta-root .conf.media { background: color-mix(in srgb, var(--bachata) 16%, transparent); color: var(--bachata); }
  .ncta-root .why { font-size: 9px; color: var(--muted-2); margin-top: 3px; }

  .ncta-root .laptop { width: 100%; }
  .ncta-root .laptop .lid { border-radius: 16px 16px 5px 5px; padding: 11px 11px 0; background: linear-gradient(160deg, #21382d, #0b1712); border: 1px solid var(--line-soft); border-bottom: none; box-shadow: 0 55px 100px -45px rgba(0,0,0,.9), 0 0 0 1px rgba(0,0,0,.4); }
  .ncta-root .laptop .disp { border-radius: 7px 7px 0 0; overflow: hidden; aspect-ratio: 16 / 10; background: var(--selva); border: 1px solid #14302366; border-bottom: none; }
  .ncta-root .laptop .deck { height: 14px; width: 116%; margin-left: -8%; position: relative; background: linear-gradient(#26402f, #0d1c15); border-radius: 0 0 13px 13px; box-shadow: 0 22px 34px -22px #000; }
  .ncta-root .laptop .deck::after { content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 74px; height: 5px; border-radius: 0 0 7px 7px; background: #0a1712; }
  .ncta-root .desk { display: flex; height: 100%; text-align: left; }
  .ncta-root .desk .side { width: 28%; max-width: 188px; flex: none; background: color-mix(in srgb, var(--surface) 60%, var(--selva)); border-right: 1px solid var(--line-soft); padding: 11px 9px; overflow: hidden; }
  .ncta-root .desk .lg { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 11px; letter-spacing: -0.02em; margin-bottom: 12px; }
  .ncta-root .desk .lg .m { width: 15px; height: 15px; border-radius: 5px; background: radial-gradient(120% 120% at 30% 20%, var(--clave), var(--son) 70%); }
  .ncta-root .desk .lg b { color: var(--clave); }
  .ncta-root .desk .lbl { font-size: 7px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--muted-2); margin: 11px 2px 5px; }
  .ncta-root .desk .nav { display: flex; flex-direction: column; gap: 2px; }
  .ncta-root .desk .nav a { padding: 4px 7px; border-radius: 6px; color: var(--muted); font-size: 9px; text-decoration: none; display: flex; justify-content: space-between; align-items: center; }
  .ncta-root .desk .nav a.on { background: color-mix(in srgb, var(--son) 16%, transparent); color: var(--clave); font-weight: 600; }
  .ncta-root .desk .nav a.sub { padding-left: 15px; font-size: 8.5px; }
  .ncta-root .desk .nav a .soon { font-size: 6.5px; background: var(--surface); padding: 1px 4px; border-radius: 4px; color: var(--muted-2); }
  .ncta-root .desk .grp { font-size: 8px; font-weight: 700; color: var(--muted-2); padding: 6px 7px 2px; display: flex; align-items: center; gap: 4px; }
  .ncta-root .desk .grp .yt { width: 8px; height: 8px; border-radius: 2px; background: #FF0000; }
  .ncta-root .desk .grp .sp { width: 8px; height: 8px; border-radius: 50%; background: #1DB954; }
  .ncta-root .desk .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .ncta-root .desk .top { display: flex; align-items: center; justify-content: space-between; padding: 8px 13px; border-bottom: 1px solid var(--line-soft); font-size: 9px; color: var(--muted); }
  .ncta-root .desk .top .r { display: flex; align-items: center; gap: 8px; }
  .ncta-root .desk .top .av { width: 16px; height: 16px; border-radius: 50%; background: var(--son); color: #fff; display: grid; place-items: center; font-size: 8px; font-weight: 700; }
  .ncta-root .desk .body { padding: 13px 15px; flex: 1; overflow: hidden; }
  .ncta-root .desk .h1 { font-size: 15px; font-weight: 800; letter-spacing: -0.02em; }
  .ncta-root .desk .h1s { font-size: 9px; color: var(--muted); margin: 2px 0 10px; }
  .ncta-root .dtable { width: 100%; border-collapse: collapse; }
  .ncta-root .dtable th { text-align: left; color: var(--muted-2); font-weight: 600; padding: 6px 7px; border-bottom: 1px solid var(--line-soft); font-size: 8px; }
  .ncta-root .dtable td { padding: 6px 7px; border-bottom: 1px solid #16302455; font-size: 9px; vertical-align: middle; }
  .ncta-root .dtable .tcov { width: 26px; height: 20px; border-radius: 4px; }
  .ncta-root .dtable .tt { font-weight: 600; }
  .ncta-root .dtable .ta { color: var(--clave); font-weight: 600; }
  .ncta-root .dtable .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  .ncta-root .dtable .acts { display: flex; gap: 4px; justify-content: flex-end; }
  .ncta-root .dtable .ab { width: 15px; height: 15px; border-radius: 4px; background: #17322650; border: 1px solid var(--line-soft); display: grid; place-items: center; font-size: 7px; color: var(--nectar); }
  .ncta-root .devices { position: relative; padding-bottom: 30px; }
  .ncta-root .devices .phone { position: absolute; right: -6px; bottom: -6px; width: 168px; z-index: 3; box-shadow: 0 40px 70px -25px rgba(0,0,0,.85), 0 0 0 1px var(--line-soft); }
  @media (max-width: 860px) { .ncta-root .devices { display: flex; flex-direction: column; align-items: center; gap: 22px; padding-bottom: 0; } .ncta-root .devices .phone { position: static; width: 210px; } }

  .ncta-root .closing { position: relative; padding: clamp(64px, 11vw, 120px) 0; text-align: center; border-top: 1px solid var(--line-soft); overflow: hidden; }
  .ncta-root .closing::before { content:""; position:absolute; inset:0; z-index:0; background: radial-gradient(80% 120% at 50% 0%, color-mix(in srgb, var(--son) 22%, transparent), transparent 60%); }
  .ncta-root .closing .inner { position: relative; z-index: 1; }
  .ncta-root .closing h2 { font-size: clamp(30px, 6vw, 56px); letter-spacing: -0.035em; line-height: 1.02; margin: 0 auto; max-width: 16ch; text-wrap: balance; }
  .ncta-root .closing p { color: var(--muted); max-width: 52ch; margin: 18px auto 0; font-size: 17px; }
  .ncta-root footer { border-top: 1px solid var(--line-soft); padding: 26px 0; color: var(--muted-2); font-size: 13px; }
  .ncta-root footer .row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; width: min(1120px,92vw); margin-inline: auto; }
  .ncta-root footer b.a { color: var(--sabor); } .ncta-root footer b.c { color: var(--clave); }

  @keyframes ncta-fadeup { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
  .ncta-root .reveal { animation: ncta-fadeup .7s cubic-bezier(.2,.7,.2,1) both; }
  @media (prefers-reduced-motion: reduce) { .ncta-root .reveal, .ncta-root .pill.epica { animation: none; } }
  .ncta-root a:focus-visible, .ncta-root button:focus-visible { outline: 2px solid var(--clave); outline-offset: 3px; border-radius: 4px; }
</style>

<div class="ncta-root">
<header class="topbar"><div class="row">
  <div class="brand"><span class="mark">&#9670;</span><span class="word">necta<b>son</b></span></div>
  <div class="right"><span class="tag">Ecosistema del baile social latino</span><a class="btn ghost sm" href="#login" data-login>Entrar</a></div>
</div></header>

<section class="hero"><div class="wrap inner">
  <span class="eyebrow"><span class="dot-b"></span><span class="dot-s"></span> Bachata &amp; Salsa &middot; Chile</span>
  <h1>El baile latino,<br>por fin <span class="heat">en un solo lugar</span>.</h1>
  <p class="lede">Descubre lo nuevo que est&aacute; sonando, arma tus playlists con inteligencia y conoce a cada artista de la escena. <b>Nectason</b> es el ecosistema donde bailarines, DJs y organizadores se encuentran.</p>
  <div class="hero-cta">
    <a class="btn primary" href="#login" data-login>Entrar a Nectason &rarr;</a>
    <a class="btn ghost" href="#descubre">Ver funciones</a>
  </div>
  <div class="stats">
    <div class="stat"><div class="n b">590</div><div class="l">canciones curadas</div></div>
    <div class="stat"><div class="n g">2</div><div class="l">plataformas unidas &middot; YouTube + Spotify</div></div>
    <div class="stat"><div class="n s">100%</div><div class="l">bachata &amp; salsa</div></div>
  </div>
</div>

<div class="wrap reveal" style="position:relative;z-index:1;margin-top:clamp(46px,7vw,82px);">
  <div class="laptop"><div class="lid"><div class="disp"><div class="desk">
    <aside class="side">
      <div class="lg"><span class="m"></span>necta<b>son</b></div>
      <div class="nav">
        <a href="#">&#127968; Inicio</a>
        <div class="lbl">M&oacute;dulos</div>
        <a href="#" class="on">&#127911; M&uacute;sica y DJs</a>
        <a href="#" class="sub" style="color:var(--clave)">Descubre</a>
        <a href="#" class="sub">Artistas</a>
        <div class="grp"><span class="yt"></span> YouTube</div>
        <a href="#" class="sub">Playlists YouTube</a>
        <div class="grp"><span class="sp"></span> Spotify</div>
        <a href="#" class="sub">Playlists Spotify</a>
        <a href="#">&#128197; Eventos <span class="soon">pronto</span></a>
        <a href="#">&#128179; Ventas y Pagos <span class="soon">pronto</span></a>
        <a href="#">&#127942; Competencias <span class="soon">pronto</span></a>
      </div>
    </aside>
    <div class="main">
      <div class="top"><span>&#127911; M&uacute;sica y DJs</span><span class="r"><span>Ver como &middot; Super Admin</span><span>&#128276;</span><span class="av">J</span></span></div>
      <div class="body">
        <div class="h1">TOP <span style="font-size:9px;color:var(--muted);font-weight:400;">(YouTube)</span></div>
        <div class="h1s">46 videos &middot; 2 h 46 min &middot; P&uacute;blica</div>
        <div class="counters" style="margin:0 0 11px;">
          <div class="counter b"><span class="cn">42</span><span class="cl">Bachatas</span></div>
          <div class="counter s"><span class="cn">4</span><span class="cl">Salsas</span></div>
        </div>
        <div class="chips" style="margin:0 0 12px;">
          <span class="chip">Romeo Santos <b>24%</b></span><span class="chip">Dimelo Cupido <b>7%</b></span><span class="chip">Prince Royce <b>7%</b></span><span class="chip">Dj Husky <b>7%</b></span><span class="chip">Montelier <b>7%</b></span><span class="chip">Dani J <b>5%</b></span><span class="chip">Charles Luis <b>5%</b></span>
        </div>
        <table class="dtable">
          <thead><tr><th>#</th><th>T&iacute;tulo</th><th>Artista</th><th>Estilo</th><th class="num">Dur.</th><th></th></tr></thead>
          <tbody>
            <tr><td class="num">1</td><td><div style="display:flex;align-items:center;gap:7px;"><span class="tcov cov a"></span><span class="tt">Encerrados</span> <span class="pill epica">&#128293; &Eacute;pica</span></div></td><td class="ta">Romeo Santos, Prince Royce</td><td><span class="pill bach">BACHATA</span></td><td class="num">3:41</td><td><div class="acts"><span class="ab">&#9654;</span><span class="ab">&#127916;</span></div></td></tr>
            <tr><td class="num">2</td><td><div style="display:flex;align-items:center;gap:7px;"><span class="tcov cov c"></span><span class="tt">QUEDATE</span> <span class="pill nueva">&#10024; Nueva</span></div></td><td class="ta">El Coque7o</td><td><span class="pill bach">BACHATA</span></td><td class="num">4:20</td><td><div class="acts"><span class="ab">&#9654;</span><span class="ab">&#127916;</span></div></td></tr>
            <tr><td class="num">3</td><td><div style="display:flex;align-items:center;gap:7px;"><span class="tcov cov b"></span><span class="tt">BARCELONA</span></div></td><td class="ta">Dj Husky, Charles Luis, Dimelo Cupido</td><td><span class="pill bach">BACHATA</span></td><td class="num">3:21</td><td><div class="acts"><span class="ab">&#9654;</span><span class="ab">&#127916;</span></div></td></tr>
            <tr><td class="num">4</td><td><div style="display:flex;align-items:center;gap:7px;"><span class="tcov cov d"></span><span class="tt">Fantas&iacute;a</span> <span class="pill epica">&#128293; &Eacute;pica</span></div></td><td class="ta">Havana D'Primera</td><td><span class="pill sal">SALSA</span></td><td class="num">5:08</td><td><div class="acts"><span class="ab">&#9654;</span><span class="ab">&#127916;</span></div></td></tr>
            <tr><td class="num">5</td><td><div style="display:flex;align-items:center;gap:7px;"><span class="tcov cov a"></span><span class="tt">Lokita Por M&iacute;</span> <span class="pill epica">&#128293; &Eacute;pica</span></div></td><td class="ta">Romeo Santos</td><td><span class="pill bach">BACHATA</span></td><td class="num">4:00</td><td><div class="acts"><span class="ab">&#9654;</span><span class="ab">&#127916;</span></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div></div></div><div class="deck"></div></div>
</div>
</section>

<section class="feature" id="descubre"><div class="wrap grid">
  <div class="copy reveal">
    <div class="kicker b">Descubre</div>
    <h2>Lo nuevo que est&aacute; sonando, ahora.</h2>
    <p>Los &uacute;ltimos lanzamientos de bachata y salsa, ordenados por lo que <b>m&aacute;s pega en el momento</b>. Cada canci&oacute;n con su artista al frente &mdash; descubre temas y de qui&eacute;n son, sin pensar en la plataforma.</p>
    <ul class="bullets">
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> Ranking por reproducciones/d&iacute;a (momentum real)</li>
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> P&iacute;ldoras <b>&#10024; Nueva</b> y <b>&#128293; &Eacute;pica</b> de un vistazo</li>
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> YouTube + Spotify, fusionados en una sola vista</li>
    </ul>
  </div>
  <div class="stage reveal"><div class="phone"><div class="screen">
    <div class="s-head"><span class="m"></span><span class="w">necta<b>son</b></span></div>
    <div class="s-title">&#128293; Descubre</div>
    <div class="s-sub">Lo nuevo que suena en bachata y salsa</div>
    <div class="sec-h b">Bachata &mdash; nuevo y sonando</div>
    <div class="row"><span class="rank">1</span><span class="cov a"></span><div class="meta"><div class="t">Encerrados</div><div class="ar">Romeo Santos, Prince Royce</div><div class="pills"><span class="pill bach">BACHATA</span><span class="pill epica">&#128293; &Eacute;pica</span><span class="vpd">&#128293; 48/d</span></div></div><span class="play">&#9654;</span></div>
    <div class="row"><span class="rank">2</span><span class="cov c"></span><div class="meta"><div class="t">QUEDATE</div><div class="ar">El Coque7o</div><div class="pills"><span class="pill bach">BACHATA</span><span class="pill nueva">&#10024; Nueva</span><span class="vpd">&#128293; 21/d</span></div></div><span class="play">&#9654;</span></div>
    <div class="row"><span class="rank">3</span><span class="cov b"></span><div class="meta"><div class="t">Voodoo</div><div class="ar">Dani J</div><div class="pills"><span class="pill bach">BACHATA</span><span class="pill nueva">&#10024; Nueva</span><span class="vpd">&#128293; 14/d</span></div></div><span class="play">&#9654;</span></div>
    <div class="sec-h s">Salsa &mdash; nuevo y sonando</div>
    <div class="row"><span class="rank">1</span><span class="cov c"></span><div class="meta"><div class="t">Fantas&iacute;a</div><div class="ar">Havana D'Primera</div><div class="pills"><span class="pill sal">SALSA</span><span class="pill epica">&#128293; &Eacute;pica</span><span class="vpd">&#128293; 9/d</span></div></div><span class="play">&#9654;</span></div>
  </div></div></div>
</div></section>

<section class="feature alt"><div class="wrap grid">
  <div class="copy reveal">
    <div class="kicker g">Playlists inteligentes</div>
    <h2>Tus playlists, con superpoderes.</h2>
    <p>Trae tus playlists de YouTube a la vista y ent&iacute;endelas al instante: cu&aacute;ntas <b>bachatas</b> y <b>salsas</b> lleva, y <b>qui&eacute;nes suenan</b> &mdash; con el porcentaje de cada artista en la lista.</p>
    <ul class="bullets">
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> Contador de Bachatas / Salsas al toque</li>
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> Artistas presentes y su % en la lista</li>
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> Marca qu&eacute; est&aacute; en tu biblioteca y en el cat&aacute;logo</li>
    </ul>
  </div>
  <div class="stage reveal"><div class="phone"><div class="screen">
    <div class="s-head"><span class="m"></span><span class="w">necta<b>son</b></span></div>
    <div class="s-title">TOP</div>
    <div class="s-sub">46 videos &middot; 2 h 46 min &middot; P&uacute;blica</div>
    <div class="counters"><div class="counter b"><span class="cn">42</span><span class="cl">Bachatas</span></div><div class="counter s"><span class="cn">4</span><span class="cl">Salsas</span></div></div>
    <div class="sec-h" style="color:var(--muted)">Artistas &middot; grupos &middot; DJs presentes</div>
    <div class="chips"><span class="chip">Romeo Santos <b>24%</b></span><span class="chip">Dimelo Cupido <b>7%</b></span><span class="chip">Prince Royce <b>7%</b></span><span class="chip">Dj Husky <b>7%</b></span><span class="chip">Dani J <b>5%</b></span><span class="chip">Charles Luis <b>5%</b></span></div>
    <div class="row"><span class="cov a"></span><div class="meta"><div class="t">Encerrados</div><div class="ar">Romeo Santos, Prince Royce</div><div class="pills"><span class="pill bach">BACHATA</span><span class="pill epica">&#128293; &Eacute;pica</span><span class="pill cat">En Cat&aacute;logo</span></div></div><span class="play">&#9654;</span></div>
    <div class="row"><span class="cov c"></span><div class="meta"><div class="t">BARCELONA</div><div class="ar">Dj Husky, Charles Luis</div><div class="pills"><span class="pill bach">BACHATA</span><span class="pill lib">En Mis Canciones</span></div></div><span class="play">&#9654;</span></div>
  </div></div></div>
</div></section>

<section class="feature" id="artistas"><div class="wrap grid">
  <div class="copy reveal">
    <div class="kicker s">Artistas</div>
    <h2>Toda la escena, en un directorio.</h2>
    <p>Cada artista de bachata y salsa del cat&aacute;logo, ordenado y buscable. Descubre <b>qui&eacute;n es qui&eacute;n</b>, en qu&eacute; estilos se mueve y cu&aacute;nto suena.</p>
    <ul class="bullets">
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> Buscador instant&aacute;neo, sin acentos ni may&uacute;sculas</li>
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> Estilo (B/S) y n&ordm; de temas de cada artista</li>
    </ul>
  </div>
  <div class="stage reveal"><div class="phone"><div class="screen">
    <div class="s-head"><span class="m"></span><span class="w">necta<b>son</b></span></div>
    <div class="s-title">&#127908; Artistas</div>
    <div class="s-sub">Bachata y salsa, ordenados por nombre</div>
    <div class="search">&#128269; Buscar artista&hellip;</div>
    <div class="arow"><span class="an">Akai Rojas</span><span class="aside"><span class="sq b">B</span><span class="ac">25</span></span></div>
    <div class="arow"><span class="an">Dani J</span><span class="aside"><span class="sq b">B</span><span class="ac">67</span></span></div>
    <div class="arow"><span class="an">Havana D'Primera</span><span class="aside"><span class="sq s">S</span><span class="ac">21</span></span></div>
    <div class="arow"><span class="an">Montelier</span><span class="aside"><span class="sq b">B</span><span class="ac">30</span></span></div>
    <div class="arow"><span class="an">Prince Royce</span><span class="aside"><span class="sq b">B</span><span class="ac">26</span></span></div>
    <div class="arow"><span class="an">Romeo Santos</span><span class="aside"><span class="sq b">B</span><span class="ac">60</span></span></div>
    <div class="arow"><span class="an">Timbalive</span><span class="aside"><span class="sq s">S</span><span class="ac">53</span></span></div>
  </div></div></div>
</div></section>

<section class="feature alt"><div class="wrap grid">
  <div class="copy reveal">
    <div class="kicker g">Descubrimiento autom&aacute;tico</div>
    <h2>Nunca te pierdas un estreno.</h2>
    <p>Nectason vigila los <b>canales y perfiles</b> de tus artistas y te muestra sus &uacute;ltimos lanzamientos que a&uacute;n no tienes &mdash; de YouTube y Spotify. T&uacute; eliges cu&aacute;les sumar.</p>
    <ul class="bullets">
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> Detecta el estilo por el texto o el artista</li>
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> T&uacute; revisas y confirmas &mdash; nada entra solo</li>
    </ul>
  </div>
  <div class="stage reveal"><div class="phone"><div class="screen">
    <div class="s-head"><span class="m"></span><span class="w">necta<b>son</b></span></div>
    <div class="s-title">&#127381; Novedades</div>
    <div class="s-sub">Estrenos de tus artistas, fuera del cat&aacute;logo</div>
    <div class="sec-h b">Bachata</div>
    <div class="cand"><span class="thumb cov a"></span><div class="meta"><div class="t">Tesoro</div><div class="ar">Reydel x Dj Ramon</div><div class="pills"><span class="pill bach">BACHATA</span><span class="conf alta">alta</span></div><div class="why">&ldquo;bachata&rdquo; en la descripci&oacute;n</div></div></div>
    <div class="cand"><span class="thumb cov b"></span><div class="meta"><div class="t">Besos De Anta&ntilde;o</div><div class="ar">Akai Rojas feat. Felix</div><div class="pills"><span class="pill bach">BACHATA</span><span class="conf alta">alta</span></div><div class="why">&ldquo;bachata&rdquo; en el texto</div></div></div>
    <div class="sec-h s">Salsa</div>
    <div class="cand"><span class="thumb cov c"></span><div class="meta"><div class="t">Fantas&iacute;a</div><div class="ar">Havana D'Primera</div><div class="pills"><span class="pill sal">SALSA</span><span class="conf media">media</span></div><div class="why">heredado del canal</div></div></div>
  </div></div></div>
</div></section>

<section class="feature"><div class="wrap grid">
  <div class="copy reveal">
    <div class="kicker g">Escritorio y celular</div>
    <h2>Funciona donde bailes.</h2>
    <p>El <b>panel completo</b> en tu notebook para curar el cat&aacute;logo y armar las listas; y <b>todo en la palma de tu mano</b> cuando est&aacute;s en la pista. La misma app, adaptada a cada pantalla.</p>
    <ul class="bullets">
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> Tablas anchas en escritorio, men&uacute;-caj&oacute;n en celular</li>
      <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ec990" stroke-width="2.4" stroke-linecap="round"><path d="M5 12l5 5L20 6"/></svg> Reproduce en la app o desde tu cuenta de YouTube</li>
    </ul>
  </div>
  <div class="stage reveal"><div class="devices">
    <div class="laptop"><div class="lid"><div class="disp"><div class="desk">
      <aside class="side">
        <div class="lg"><span class="m"></span>necta<b>son</b></div>
        <div class="nav">
          <a href="#">&#127968; Inicio</a><div class="lbl">M&oacute;dulos</div>
          <a href="#" class="on">&#127911; M&uacute;sica y DJs</a>
          <a href="#" class="sub" style="color:var(--clave)">Descubre</a>
          <a href="#" class="sub">Artistas</a><a href="#" class="sub">Cat&aacute;logo</a>
          <a href="#">&#128197; Eventos <span class="soon">pronto</span></a>
          <a href="#">&#127942; Competencias <span class="soon">pronto</span></a>
        </div>
      </aside>
      <div class="main">
        <div class="top"><span>&#127911; M&uacute;sica y DJs</span><span class="r"><span>Super Admin</span><span class="av">J</span></span></div>
        <div class="body">
          <div class="h1">&#128293; Descubre</div>
          <div class="h1s">Lo nuevo que suena en bachata y salsa</div>
          <div class="sec-h b" style="margin-top:6px;">Bachata &mdash; nuevo y sonando</div>
          <div class="row"><span class="rank">1</span><span class="cov a"></span><div class="meta"><div class="t">Encerrados</div><div class="ar">Romeo Santos, Prince Royce</div></div><div class="pills"><span class="pill bach">BACHATA</span><span class="pill epica">&#128293; &Eacute;pica</span></div><span class="vpd">48/d</span></div>
          <div class="row"><span class="rank">2</span><span class="cov c"></span><div class="meta"><div class="t">QUEDATE</div><div class="ar">El Coque7o</div></div><div class="pills"><span class="pill bach">BACHATA</span><span class="pill nueva">&#10024; Nueva</span></div><span class="vpd">21/d</span></div>
          <div class="sec-h s">Salsa &mdash; nuevo y sonando</div>
          <div class="row"><span class="rank">1</span><span class="cov d"></span><div class="meta"><div class="t">Fantas&iacute;a</div><div class="ar">Havana D'Primera</div></div><div class="pills"><span class="pill sal">SALSA</span><span class="pill epica">&#128293; &Eacute;pica</span></div><span class="vpd">9/d</span></div>
        </div>
      </div>
    </div></div></div><div class="deck"></div></div>
    <div class="phone"><div class="screen" style="padding:13px 10px 11px;">
      <div class="s-head" style="margin:12px 2px 10px;"><span class="m"></span><span class="w">necta<b>son</b></span></div>
      <div class="s-title" style="font-size:16px;">&#127908; Artistas</div>
      <div class="search" style="margin-bottom:9px;">&#128269; Buscar&hellip;</div>
      <div class="arow"><span class="an">Dani J</span><span class="aside"><span class="sq b">B</span><span class="ac">67</span></span></div>
      <div class="arow"><span class="an">Montelier</span><span class="aside"><span class="sq b">B</span><span class="ac">30</span></span></div>
      <div class="arow"><span class="an">Romeo Santos</span><span class="aside"><span class="sq b">B</span><span class="ac">60</span></span></div>
      <div class="arow"><span class="an">Timbalive</span><span class="aside"><span class="sq s">S</span><span class="ac">53</span></span></div>
    </div></div>
  </div></div>
</div></section>

<section class="closing"><div class="wrap inner">
  <h2>Donde la comunidad del baile latino se encuentra.</h2>
  <p>Descubrir, armar, conectar. Bachata y salsa, con las herramientas que la escena nunca tuvo &mdash; hechas por y para quienes bailan.</p>
  <div class="hero-cta" style="justify-content:center;margin-top:30px;"><a class="btn primary" href="#login" data-login>&#128131; Entrar a Nectason</a></div>
</div></section>

<footer><div class="row">
  <span><b class="a">necta</b><b class="c">son</b> &mdash; ecosistema del baile social latino</span>
  <span>Bachata &amp; Salsa &middot; Chile</span>
</div></footer>
</div>
`;

export default function LandingPage() {
  return <Landing html={LANDING_HTML} />;
}
