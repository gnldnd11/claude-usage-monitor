// Panel webview stylesheet. Pure static CSS (no interpolation) — inlined into the
// webview HTML via <style>${CSS}</style>. Extracted from extension.js unchanged.
module.exports = `
  *{box-sizing:border-box;}
  body{margin:0;padding:0;background:transparent;color:var(--text);font-size:12px;
    font-family:var(--vscode-font-family),-apple-system,"SF Pro",sans-serif;
    --card:#232326;--inner:#191919;--track:#3a3a3d;--text:#ececec;--muted:#8b8b90;
    --border:#303034;--iborder:#2c2c30;--ringtrack:#333;--bubble:#fff;--bubblebd:rgba(0,0,0,.06);}
  body.vscode-light{--card:#ffffff;--inner:#f6f6f7;--track:#e4e4e7;--text:#1d1d1f;--muted:#78787f;
    --border:#e7e7ea;--iborder:#ededf0;--ringtrack:#e2e2e6;--bubble:#ffffff;--bubblebd:rgba(0,0,0,.14);}
  body.vscode-high-contrast{--card:#000;--inner:#000;--border:#6fc3df;--iborder:#6fc3df;--text:#fff;--track:#555;}
  .wrap{padding:10px;}
  .card{position:relative;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;}
  .head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:13px;}
  .brand{display:flex;align-items:center;gap:10px;min-width:0;}
  .logo{width:28px;height:28px;flex:none;}
  .ttl{min-width:0;flex:1 1 auto;overflow:hidden;}
  .ttl .t1{font-size:16px;font-weight:700;line-height:1.1;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .ttl .t2{color:var(--muted);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mascot{position:relative;flex:none;}
  .mascot img{width:44px;height:auto;image-rendering:pixelated;display:block;}
  .bubble{position:absolute;top:-10px;right:-13px;background:var(--bubble);border:1px solid var(--bubblebd);
    border-radius:8px;padding:3px 4px;line-height:0;box-shadow:0 2px 5px rgba(0,0,0,.2);}
  .bubble svg{width:12px;height:12px;display:block;}
  .warnbar{display:flex;align-items:flex-start;gap:8px;padding:9px 11px;margin-bottom:11px;border-radius:9px;background:rgba(229,72,77,.13);border:1px solid rgba(229,72,77,.55);color:var(--text);font-size:11.5px;line-height:1.35;}
  .warnbar[hidden]{display:none;}
  .warnbar svg{width:15px;height:15px;flex:none;}
  .warnbar .wbmsg{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;}
  .warnbar .wbq{display:block;margin-top:4px;color:var(--muted);font-style:italic;font-size:11px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .warnbar .wbx{flex:none;background:transparent;border:0;color:var(--muted);cursor:pointer;font-size:16px;line-height:1;padding:1px 5px;border-radius:5px;align-self:flex-start;}
  .warnbar .wbx:hover{background:rgba(255,255,255,.12);color:var(--text);}
  .mascot-wrap{position:relative;display:inline-flex;}
  .mwarn{position:absolute;top:-15px;left:50%;transform:translateX(-50%);background:#fff;border-radius:10px;padding:3px 5px 4px;box-shadow:0 3px 9px rgba(0,0,0,.25);cursor:pointer;z-index:6;}
  .mwarn.calm{animation:none;cursor:default;}
  .mwarn.mid{animation:pulse 1.9s ease-in-out infinite;}
  .mwarn.high{animation:pulse 1.2s ease-in-out infinite;}
  .warnbar.mid{border-color:rgba(245,166,35,.6);}
  .mwarn[hidden]{display:none;}
  .mwarn svg{width:17px;height:17px;display:block;}
  .mwarn::after{content:'';position:absolute;bottom:-6px;left:50%;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #fff;}
  .inner{position:relative;background:var(--inner);border:1px solid var(--iborder);border-radius:13px;padding:13px;}
  .ihead{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-right:5px;}
  .ihead .it{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;color:var(--text);white-space:nowrap;min-width:0;overflow:hidden;flex:0 1 auto;}
  .ihead .it svg{width:15px;height:15px;color:#e8895a;}
  .upd{color:var(--muted);font-size:10.5px;display:flex;align-items:center;gap:5px;white-space:nowrap;flex:none;}
  .upd .d{width:6px;height:6px;border-radius:50%;background:#e8895a;box-shadow:0 0 3px #e8895a;flex:none;}
  .body{display:flex;gap:14px;align-items:center;flex-wrap:nowrap;}
  .meters{flex:1 1 auto;min-width:0;}
  .meter{margin-bottom:10px;}
  .meter:last-child{margin-bottom:0;}
  .mtop{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;}
  .mlabel{color:var(--muted);font-size:11.5px;}
  .mval{font-weight:700;font-size:13px;color:var(--text);}
  .mbar{position:relative;height:7px;border-radius:4px;background:var(--track);overflow:hidden;}
  .mfill{position:absolute;left:0;top:0;height:100%;border-radius:4px;
    background:linear-gradient(90deg,#e8895a,#f0a882);transition:width .5s ease;width:0;}
  .msub{color:var(--muted);font-size:10px;margin-top:3px;text-align:right;opacity:.85;}
  .ringbox{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;}
  .ringwrap{position:relative;width:88px;height:88px;}
  .ringwrap svg{transform:rotate(-90deg);}
  .rtrack{stroke:var(--ringtrack);}
  .rcenter{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .rpct{font-size:22px;font-weight:800;color:#e8895a;line-height:1;}
  .rpct span:last-child{font-size:12px;}
  .rtext{font-size:9.5px;color:var(--muted);margin-top:2px;}
  .sparkle{width:88px;height:auto;margin-top:2px;image-rendering:pixelated;}
  .stats{display:flex;gap:1px;margin-top:13px;background:var(--iborder);border-radius:11px;overflow:hidden;}
  .stat{flex:1;background:var(--inner);padding:10px 8px;min-width:0;position:relative;}
  .stat .stop{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
  .stat svg{width:14px;height:14px;color:#e8895a;flex:none;}
  .stat .sval{font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .stat .slabel{color:var(--muted);font-size:10px;white-space:nowrap;}
  /* narrow panel: hide the stat tiles so values never truncate */
  body.narrow .stats{display:none;}
  .mgrp{display:flex;align-items:baseline;gap:6px;}
  .srow{display:flex;align-items:baseline;gap:5px;}
  .delta,.sdelta{color:#e8895a;font-weight:700;opacity:0;}
  .delta{font-size:11px;}
  .sdelta{font-size:10px;position:absolute;top:7px;right:8px;}
  .delta.show,.sdelta.show{animation:flash 1.9s ease forwards;}
  #ringArc{transition:stroke-dashoffset .6s ease, stroke .3s ease;}
  .roll{display:inline-block;animation:roll .45s ease;}
  .upd .d{animation:pulse 2.2s ease-in-out infinite;}
  .notrans *{transition:none !important;}
  .hactions{display:flex;align-items:center;gap:6px;flex:none;}
  .toggle{background:transparent;border:0;color:var(--muted);cursor:pointer;padding:4px;border-radius:6px;display:flex;line-height:0;}
  .toggle:hover{background:var(--track);color:var(--text);}
  .toggle svg{width:16px;height:16px;transition:transform .4s cubic-bezier(.34,1.56,.64,1);}
  .sheet{position:fixed;inset:0;background:rgba(0,0,0,.28);display:flex;align-items:flex-start;justify-content:center;padding:14px;z-index:1000;animation:fade .16s ease;}
  .sheet[hidden]{display:none;}
  .sheet-card{background:var(--inner);border:1px solid var(--iborder);border-radius:12px;width:100%;max-width:280px;padding:13px 15px;box-shadow:0 8px 28px rgba(0,0,0,.32);max-height:100%;overflow-y:auto;box-sizing:border-box;}
  .sheet-head{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:13px;color:var(--text);margin-bottom:12px;}
  .sheet-x{background:transparent;border:0;color:var(--muted);cursor:pointer;padding:3px;border-radius:6px;display:flex;line-height:0;}
  .sheet-x:hover{background:var(--track);color:var(--text);}
  .sheet-x svg{width:15px;height:15px;transform:rotate(180deg);}
  .sheet-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--text);}
  .sheet-row + .sheet-row{margin-top:11px;}
  .sheet-row label{color:var(--muted);}
  .sheet-row select{background:var(--track);color:var(--text);border:1px solid var(--iborder);border-radius:7px;padding:5px 8px;font-size:12px;cursor:pointer;}
  @keyframes fade{from{opacity:0}to{opacity:1}}
  .sheet-sec{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:15px 0 7px;font-weight:700;}
  .sheet-check{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--text);cursor:pointer;padding:4px 0;}
  .sheet-check input{accent-color:#e8895a;cursor:pointer;width:14px;height:14px;flex:none;}
  .sparkle-hd{width:0;opacity:0;flex:none;object-fit:contain;transition:width .4s cubic-bezier(.34,1.56,.64,1),opacity .35s ease;}
  .compact .sparkle-hd{width:32px;opacity:1;}
  .card,.inner{transition:padding .4s cubic-bezier(.4,0,.2,1);}
  .body{transition:gap .4s cubic-bezier(.4,0,.2,1);}
  .ttl .t2,.ihead,.stats{overflow:hidden;transition:max-height .4s cubic-bezier(.4,0,.2,1),opacity .3s ease,margin .4s cubic-bezier(.4,0,.2,1);}
  .ringbox{max-width:150px;overflow:visible;transition:max-width .45s cubic-bezier(.4,0,.2,1),opacity .35s ease;}
  .ttl .t2{max-height:20px;}
  .ihead{max-height:34px;}
  .stats{max-height:90px;}
  .compact .mascot{display:none;}
  .compact .ttl .t2{max-height:0;opacity:0;}
  .compact .ihead{max-height:0;opacity:0;margin-bottom:0;}
  .compact .stats{max-height:0;opacity:0;margin-top:0;}
  .compact .ttl{display:none;}
  .compact .ringbox{max-width:0;opacity:0;overflow:hidden;}
  .compact .body{gap:0;}
  .compact .card{padding:12px;}
  .compact .inner{padding:11px;}
  .compact .head{margin-bottom:10px;}
  .compact .meter{margin-bottom:9px;}
  @keyframes flash{0%{opacity:0;transform:translateY(5px);}12%{opacity:1;transform:translateY(0);}70%{opacity:1;}100%{opacity:0;transform:translateY(-3px);}}
  @keyframes roll{0%{opacity:.25;transform:translateY(6px);}100%{opacity:1;transform:translateY(0);}}
  @keyframes pulse{0%,100%{opacity:.4;}50%{opacity:1;}}
  body.wrapcols .body{flex-wrap:wrap;}
  body.wrapcols .ringbox{margin:6px auto 0;}
  @media (max-width:270px){.stat .slabel{display:none;}.stat .sval{font-size:11px;text-overflow:clip;}.stat .sdelta{display:none;}.stat{padding:8px 6px;}.munit{display:none;}}
  /* --- tab switcher + agent roster (tide pool) --- */
  .tabs{display:flex;gap:3px;margin-bottom:11px;background:var(--inner);border:1px solid var(--iborder);border-radius:10px;padding:3px;}
  .tab{position:relative;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;background:transparent;border:0;color:var(--muted);font-size:12px;font-weight:600;padding:6px 8px;border-radius:7px;cursor:pointer;font-family:inherit;transition:color .15s ease,background .15s ease;}
  .tab.active{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.18);}
  .tab:hover:not(.active){color:var(--text);}
  .tab-beta{flex:none;font-size:7.5px;font-weight:800;letter-spacing:.5px;line-height:1;padding:2px 4px;border-radius:5px;color:#fff;background:linear-gradient(135deg,#e8895a,#e5686a);box-shadow:0 1px 2px rgba(0,0,0,.25);transform:translateY(-0.5px);}
  body.narrow .tab-beta{display:none;}
  .inner.agents{padding:11px 11px 14px;}
  .ws-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:10px;min-width:0;}
  .ws-head .it{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;color:var(--text);min-width:0;overflow:hidden;flex:1 1 auto;}
  .ws-head .it svg{width:15px;height:15px;color:#e8895a;flex:none;}
  .ws-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  body.narrow .ws-title{display:none;}
  .ws-map{display:flex;align-items:center;flex:none;max-width:60%;color:var(--muted);background:var(--inner);border:1px solid var(--iborder);border-radius:8px;padding:2px 5px;}
  .ws-map select{background:transparent;border:0;color:var(--text);font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;padding:1px 0;max-width:100%;}
  .ws-map select:focus{outline:none;}
  .ws-room{position:relative;width:100%;aspect-ratio:1/1;border-radius:11px;overflow:hidden;background:#0c0c0d;border:1px solid var(--iborder);}
  body.vscode-light .ws-room{background:#ececef;}
  .ws-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;}
  .ws-stage{position:absolute;inset:0;overflow:hidden;}
  .ws-hud{position:absolute;top:6px;left:7px;z-index:8;display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;letter-spacing:.2px;color:#fff;background:rgba(0,0,0,.5);padding:2px 8px;border-radius:8px;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.4);}
  .ws-hud-sep{opacity:.45;font-weight:400;}
  .ws-hud-delta{position:absolute;top:26px;left:9px;z-index:8;font-size:11px;font-weight:800;color:#e8895a;letter-spacing:.2px;opacity:0;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.7);}
  .ws-hud-delta.show{animation:flash 1.9s ease forwards;}
  .walker{position:absolute;transform:translate(-50%,-100%);transition:left 1.6s ease-in-out,top 1.6s ease-in-out,opacity .45s ease;pointer-events:none;}
  .wk-sprite{image-rendering:pixelated;}
  .wk-role,.wk-name{position:absolute;left:50%;transform:translateX(-50%);font-size:8.5px;font-weight:700;white-space:nowrap;letter-spacing:.2px;padding:1px 5px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.5);}
  .wk-role{bottom:100%;margin-bottom:3px;color:#ffcaa8;background:rgba(20,12,8,.82);}
  .wk-name{top:100%;margin-top:3px;color:#fff;background:rgba(20,12,8,.82);}
  .ws-stage.crowded .wk-role,.ws-stage.crowded .wk-name{display:none;}
  .cr-sprite{image-rendering:pixelated;cursor:pointer;}
  .pool{display:flex;flex-wrap:wrap;justify-content:center;row-gap:8px;padding:8px 2px 2px;overflow:hidden;max-height:600px;opacity:1;transition:max-height .34s cubic-bezier(.4,0,.2,1),opacity .24s ease;}
  .crew-mini{overflow:hidden;max-height:0;opacity:0;transition:max-height .34s cubic-bezier(.4,0,.2,1),opacity .24s ease;}
  .crew-collapsed .pool{max-height:0;opacity:0;padding-top:0;padding-bottom:0;}
  .crew-collapsed .crew-mini{max-height:420px;opacity:1;}
  .cr-card{position:relative;flex:0 0 25%;display:flex;flex-direction:column;align-items:center;min-width:0;padding:5px 1px 8px;border-radius:10px;cursor:pointer;transition:opacity .3s ease,box-shadow .18s ease,background .18s ease;}
  .cr-card:hover:not(.selected){background:rgba(127,127,127,.09);}
  .cr-card:hover .cr-sprite{filter:brightness(1.1);}
  .cr-card.selected{background:rgba(232,137,90,.13);box-shadow:0 0 0 1.5px #e8895a;}
  .cr-gear{position:absolute;top:2px;left:3px;display:none;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:rgba(232,137,90,.92);color:#fff;cursor:pointer;line-height:0;box-shadow:0 1px 4px rgba(0,0,0,.3);z-index:5;}
  .cr-card.selected .cr-gear{display:inline-flex;}
  .cr-gear:hover{background:#e8895a;}
  .cr-gear svg{width:12px;height:12px;}
  /* agent settings modal */
  .sheet-row input[type=text]{background:var(--track);color:var(--text);border:1px solid var(--iborder);border-radius:7px;padding:5px 8px;font-size:12px;font-family:inherit;width:130px;}
  .am-appearance{display:block;}
  .am-tabs{display:flex;gap:4px;margin-bottom:10px;}
  .am-tab{flex:1;background:var(--track);border:0;color:var(--muted);font-size:11px;font-weight:600;padding:6px 4px;border-radius:7px;cursor:pointer;font-family:inherit;white-space:nowrap;}
  .am-tab.on{background:#e8895a;color:#fff;}
  .am-tab:hover:not(.on){color:var(--text);}
  .am-row{display:flex;flex-wrap:wrap;gap:6px;}
  .am-npc{width:50px;height:50px;border-radius:9px;border:2px solid transparent;background:var(--track);display:flex;align-items:flex-end;justify-content:center;overflow:hidden;cursor:pointer;}
  .am-npc:hover{border-color:var(--muted);}
  .am-npc.on{border-color:#e8895a;background:rgba(232,137,90,.18);}
  .am-npc .cr-sprite{image-rendering:pixelated;}
  .cr-modelsel.m-opus{background:rgba(232,137,90,.95);}
  .cr-modelsel.m-sonnet{background:rgba(90,154,232,.95);}
  .cr-modelsel.m-haiku{background:rgba(95,184,122,.95);}
  .cr-modelsel.m-other{background:rgba(127,127,127,.8);}
  .cr-badge{position:absolute;top:-3px;left:50%;transform:translateX(-50%) translateY(-4px);width:15px;height:15px;border-radius:50%;background:#4fae74;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s ease,transform .2s ease;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.4);z-index:5;}
  .cr-badge svg{width:10px;height:10px;}
  .cr-card.done .cr-badge{opacity:1;transform:translateX(-50%) translateY(0);}
  .cr-card.active{animation:crPulseR 1.1s ease-in-out infinite;}
  .cr-card.done{animation:crPulseG 1.1s ease-in-out infinite;}
  @keyframes crPulseR{0%,100%{box-shadow:0 0 0 1.5px rgba(229,72,77,.5);}50%{box-shadow:0 0 0 2.5px rgba(229,72,77,1);}}
  @keyframes crPulseG{0%,100%{box-shadow:0 0 0 1.5px rgba(79,174,116,.5);}50%{box-shadow:0 0 0 2.5px rgba(79,174,116,1);}}
  .cr-card.active .cr-sprite{filter:drop-shadow(0 0 5px rgba(229,72,77,.55));}
  .cr-card.done .cr-sprite{filter:drop-shadow(0 0 5px rgba(79,174,116,.55));}
  /* when any agent is active, dim the resting ones so the caller stands out */
  .pool.has-active .cr-card:not(.active):not(.done){opacity:.42;}
  .cr-body{display:flex;align-items:flex-end;justify-content:center;height:calc(52px * var(--cr-scale, 1));overflow:hidden;line-height:0;}
  .cr-body .cr-sprite{transform:scale(var(--cr-scale, 1));transform-origin:bottom center;}
  .cr-name{font-size:clamp(8px, calc(10.5px * var(--cr-scale, 1)), 10.5px);font-weight:600;color:var(--text);margin-top:3px;text-align:center;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .cr-role{font-size:clamp(7.5px, calc(9.5px * var(--cr-scale, 1)), 9.5px);font-weight:600;color:#e8895a;margin-top:2px;text-align:center;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .pool-empty{color:var(--muted);font-size:11.5px;text-align:center;padding:26px 12px;line-height:1.55;}
  /* collapsed Crew: compact "now running" strip */
  .crew-mini{padding:4px 2px 2px;}
  .crew-idle{color:var(--muted);font-size:11px;text-align:center;padding:12px 8px;}
  .cm-row{display:flex;align-items:center;gap:9px;padding:7px 4px;}
  .cm-row + .cm-row{border-top:1px solid var(--iborder);}
  .cm-sprite{flex:none;width:34px;height:38px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;}
  .cm-mid{flex:1 1 auto;min-width:0;}
  .cm-top{display:flex;align-items:baseline;gap:6px;}
  .cm-name{font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .cm-model{font-size:9px;font-weight:700;color:var(--muted);letter-spacing:.2px;flex:none;}
  .cm-desc{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
  .cm-bar{position:relative;height:4px;border-radius:3px;background:var(--track);overflow:hidden;margin-top:5px;}
  .cm-bar::after{content:'';position:absolute;top:0;left:0;height:100%;width:40%;border-radius:3px;background:linear-gradient(90deg,#e8895a,#f0a882);animation:cmSweep 1.3s ease-in-out infinite;}
  .cm-row.done .cm-bar::after{width:100%;animation:none;background:#4fae74;}
  .cm-time{flex:none;font-size:9.5px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums;}
  @keyframes cmSweep{0%{left:-40%;}100%{left:100%;}}
`;
