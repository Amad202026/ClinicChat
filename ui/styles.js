globalThis.CC = globalThis.CC || {};
globalThis.CC.buildCss = ({ SIZE, GAP }) => `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #172b4d;
    pointer-events: auto;
  }

  @keyframes pop { 0% { transform: scale(.4); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
  @keyframes ring { 0% { box-shadow: 0 0 0 0 rgba(23,105,210,.5); } 100% { box-shadow: 0 0 0 16px rgba(23,105,210,0); } }
  @keyframes badgePop { 0% { transform: scale(0); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
  @keyframes viewIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes msgIn { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }
  @keyframes flash { 0% { box-shadow: 0 0 0 0 rgba(240,180,41,.7); } 100% { box-shadow: 0 0 0 10px rgba(240,180,41,0); } }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes toastIn { from { opacity: 0; transform: translateY(-12px) scale(.97); } to { opacity: 1; transform: none; } }
  @keyframes menuIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes whoIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: none; } }
  @keyframes fly { 0% { transform: none; } 45% { transform: translate(7px, -7px) scale(.7); opacity: 0; } 55% { transform: translate(-7px, 7px) scale(.7); opacity: 0; } 100% { transform: none; opacity: 1; } }
  @keyframes blink { 50% { opacity: .35; } }

  .launcher {
    position: relative;
    width: ${SIZE}px; height: ${SIZE}px; border: 0; border-radius: 50%;
    background: #1769d2; color: white; cursor: grab; padding: 0;
    box-shadow: 0 8px 28px rgba(20, 75, 145, .28);
    display: grid; place-items: center;
    transition: transform .2s cubic-bezier(.2,.9,.3,1.3), background .18s, box-shadow .18s;
    touch-action: none; user-select: none; -webkit-user-select: none;
  }
  .launcher.intro { animation: pop .5s cubic-bezier(.2,.9,.3,1.2) both; }
  .launcher:hover { background: #0f56b5; transform: translateY(-3px) scale(1.04); }
  .launcher:active { transform: scale(.94); }
  .launcher.dragging {
    cursor: grabbing; transition: none; transform: scale(1.08);
    box-shadow: 0 14px 36px rgba(20, 75, 145, .4);
  }
  .launcher.alert { animation: ring 1.6s ease-out infinite; }
  .launcher .logo {
    font-size: 21px; font-weight: 800; letter-spacing: -1.2px; line-height: 1;
    font-family: inherit; pointer-events: none; transition: transform .25s;
  }
  .launcher.open-state .logo { transform: rotate(360deg) scale(.92); }
  .count {
    position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px;
    border-radius: 10px; background: #e5484d; color: #fff; font-size: 11px; font-weight: 700;
    display: grid; place-items: center; border: 2px solid #fff; pointer-events: none;
    animation: badgePop .3s cubic-bezier(.2,.9,.3,1.4);
  }
  .count[hidden] { display: none; }
  .count.tag { background: #f0a30a; }

  .panel {
    position: absolute; top: auto; bottom: auto; left: 0;
    width: 360px; height: 500px; min-height: 0;
    background: #fff; border: 1px solid #e4eaf2;
    border-radius: 16px; overflow: hidden; display: flex; flex-direction: column;
    box-shadow: 0 16px 55px rgba(15, 35, 65, .2);
    visibility: hidden; opacity: 0; pointer-events: none;
    transform: translateY(var(--dy, 12px)) scale(.94);
    transition: opacity .18s ease, transform .26s cubic-bezier(.2,.9,.3,1.15), visibility 0s linear .26s;
  }
  .panel.open {
    visibility: visible; opacity: 1; pointer-events: auto; transform: none;
    transition-delay: 0s;
  }
  .panel.up { bottom: ${SIZE + GAP}px; --dy: 12px; }
  .panel.down { top: ${SIZE + GAP}px; --dy: -12px; }

  .header {
    min-height: 66px; padding: 14px 16px; color: white;
    background: linear-gradient(135deg, #1769d2, #2588e8);
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
  }
  .badge {
    width: 34px; height: 34px; flex: none; border-radius: 50%;
    background: #fff; color: #1769d2; display: grid; place-items: center;
    font-size: 14px; font-weight: 800; letter-spacing: -.8px;
  }
  .brand { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
  .brand strong { font-size: 14px; letter-spacing: .2px; }
  .brand span { font-size: 11px; opacity: .86; }
  .close {
    border: 0; background: rgba(255,255,255,.16); color: white;
    width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
    font-size: 20px; line-height: 1; transition: background .15s, transform .2s;
  }
  .close:hover { background: rgba(255,255,255,.3); transform: rotate(90deg); }

  .nav {
    position: relative; display: grid; grid-template-columns: repeat(var(--n, 4), 1fr);
    border-bottom: 1px solid #edf0f5; background: #fff;
  }
  .nav button {
    position: relative; border: 0; background: transparent; padding: 12px 3px;
    color: #718096; font-size: 11px; cursor: pointer; font-family: inherit;
    transition: color .2s;
  }
  .nav button[hidden] { display: none; }
  .nav button:hover { color: #1769d2; }
  .nav button.active { color: #1769d2; font-weight: 700; }
  .nav .ink {
    position: absolute; left: 0; bottom: 0; width: calc(100% / var(--n, 4)); height: 2px; background: #1769d2;
    border-radius: 2px; transform: translateX(calc(var(--i, 0) * 100%));
    transition: transform .3s cubic-bezier(.3,.9,.3,1.1);
  }
  .nav .pill {
    display: inline-grid; place-items: center; min-width: 15px; height: 15px; padding: 0 4px;
    margin-left: 4px; border-radius: 8px; background: #e5484d; color: #fff; font-size: 9px; font-weight: 700;
    vertical-align: 1px; animation: badgePop .3s cubic-bezier(.2,.9,.3,1.4);
  }
  .nav .pill.tag { background: #f0a30a; }
  .nav .pill[hidden] { display: none; }

  .stage { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .body {
    flex: 1; min-height: 0; background: #f7f9fc;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .body > * { flex: 1; min-height: 0; }
  .body > div > * { flex: 1; min-height: 0; }
  .mount { display: flex; flex-direction: column; }
  .view { animation: viewIn .26s ease-out both; }

  .toast {
    position: absolute; top: 8px; left: 10px; right: 10px; z-index: 5; cursor: pointer;
    display: flex; gap: 9px; align-items: center; padding: 9px 11px; border-radius: 12px;
    background: #fff; border: 1px solid #dbe5f2; box-shadow: 0 8px 24px rgba(15,35,65,.18);
    animation: toastIn .28s cubic-bezier(.2,.9,.3,1.2);
  }
  .toast[hidden] { display: none; }
  .toast.tag { border-color: #f0b429; background: #fffaf0; }
  .toast-av {
    flex: none; width: 28px; height: 28px; border-radius: 50%; background: #1769d2; color: #fff;
    display: grid; place-items: center; font-size: 12px; font-weight: 700;
  }
  .toast.tag .toast-av { background: #f0a30a; }
  .toast-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .toast-text strong { font-size: 12px; color: #1d3557; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .toast-text span { font-size: 12px; color: #4a5568; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .center {
    padding: 18px; display: flex; flex-direction: column; align-items: center;
    justify-content: center; text-align: center; overflow: auto;
  }
  .symbol {
    width: 52px; height: 52px; border-radius: 16px; display: grid;
    place-items: center; color: #1769d2; background: #e8f2ff; margin-bottom: 12px;
  }
  h2 { font-size: 15px; margin: 0 0 7px; color: #1d3557; }
  .center p { font-size: 12px; line-height: 1.55; color: #718096; margin: 0 0 10px; max-width: 260px; }
  button.primary, button.secondary {
    border: 0; border-radius: 10px; padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
    font-family: inherit; transition: background .15s, transform .15s;
  }
  button.primary:active:not(:disabled), button.secondary:active:not(:disabled) { transform: scale(.97); }
  button.primary { background: #1769d2; color: #fff; width: 100%; position: relative; }
  button.primary:hover:not(:disabled) { background: #0f56b5; }
  button.secondary { background: #e8f2ff; color: #1769d2; }
  button.secondary:hover:not(:disabled) { background: #d6e8ff; }
  button:disabled { opacity: .6; cursor: default; }
  button.primary .spinner {
    display: none; width: 14px; height: 14px; margin-right: 8px; vertical-align: -2px;
    border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  button.primary.busy .spinner { display: inline-block; }

  .login { padding: 20px 22px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
  .login-logo {
    width: 46px; height: 46px; border-radius: 50%; background: #1769d2; color: #fff;
    display: grid; place-items: center; font-weight: 800; font-size: 17px; letter-spacing: -1px; margin: 0 auto;
    animation: pop .5s cubic-bezier(.2,.9,.3,1.2) both;
  }
  .login label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4a5568; font-weight: 600; }
  .login label[hidden] { display: none; }
  .login label:not([hidden]).reg-only { animation: viewIn .25s ease-out both; }
  .login input {
    border: 1px solid #d5dde8; border-radius: 9px; padding: 10px 11px; font-size: 13px;
    font-family: inherit; color: #172b4d; background: #fff; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .login input:focus { border-color: #1769d2; box-shadow: 0 0 0 3px rgba(23,105,210,.15); }
  .notice { font-size: 12px; padding: 9px 11px; border-radius: 9px; }
  .notice[hidden] { display: none; }
  .notice.error { background: #fdecec; color: #a12727; }
  .notice.ok { background: #e6f6ec; color: #1f7a45; }
  .notice.shake { animation: shake .4s; }
  .field-msg { margin-top: -4px; font-size: 11px; color: #a12727; animation: viewIn .2s ease-out both; }
  .field-msg[hidden] { display: none; }
  .who {
    display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 10px;
    background: #e8f2ff; animation: whoIn .25s cubic-bezier(.2,.9,.3,1.2) both;
  }
  .who[hidden] { display: none; }
  .who-text { display: flex; flex-direction: column; min-width: 0; }
  .who-text strong { font-size: 13px; color: #1d3557; }
  .who-text span { font-size: 11px; color: #5b7392; }

  .seg {
    position: relative; display: grid; grid-template-columns: repeat(var(--n, 2), 1fr);
    background: #eef2f7; border-radius: 10px; padding: 3px;
  }
  .seg-ink {
    position: absolute; top: 3px; bottom: 3px; left: 3px; border-radius: 8px; background: #fff;
    width: calc((100% - 6px) / var(--n, 2)); box-shadow: 0 1px 4px rgba(15,35,65,.14);
    transform: translateX(calc(var(--i, 0) * 100%));
    transition: transform .28s cubic-bezier(.3,.9,.3,1.1);
  }
  .seg button {
    position: relative; border: 0; background: transparent; padding: 7px 4px; font-size: 12px;
    font-family: inherit; color: #718096; cursor: pointer; border-radius: 8px; transition: color .2s;
  }
  .seg button.on { color: #1769d2; font-weight: 700; }

  .profile { padding: 22px; display: flex; flex-direction: column; align-items: center; gap: 4px; overflow: auto; }
  .avatar {
    width: 56px; height: 56px; border-radius: 50%; background: #1769d2; color: #fff;
    display: grid; place-items: center; font-size: 22px; font-weight: 700; margin-bottom: 6px;
    animation: pop .45s cubic-bezier(.2,.9,.3,1.2) both;
  }
  .avatar.sm { width: 34px; height: 34px; font-size: 14px; margin: 0; flex: none; animation: none; }
  .p-name { margin: 0; }
  .p-role { margin: 0 0 10px; font-size: 12px; color: #718096; }
  .profile dl { width: 100%; margin: 6px 0 10px; font-size: 12px; }
  .profile dt { color: #9aa6b5; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; margin-top: 8px; }
  .profile dd { margin: 2px 0 0; color: #1d3557; word-break: break-all; }
  .setting { width: 100%; margin: 4px 0 14px; display: flex; flex-direction: column; gap: 6px; }
  .set-label { font-size: 10px; color: #9aa6b5; text-transform: uppercase; letter-spacing: .4px; }

  .chat { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  .chat-status {
    display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 10px;
    color: #718096; background: #fff; border-bottom: 1px solid #edf0f5; flex: none;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #9aa6b5; transition: background .3s; }
  .dot.ok { background: #35a866; } .dot.bad { background: #d64545; }
  .dot.warn { background: #e0a100; animation: blink 1.1s ease-in-out infinite; }
  .msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .day { align-self: center; font-size: 10px; color: #718096; background: #e9eef5; padding: 2px 10px; border-radius: 10px; margin: 4px 0; }
  .empty { margin: auto; color: #9aa6b5; font-size: 12px; text-align: center; animation: viewIn .3s ease-out both; }
  .msg { max-width: 82%; display: flex; flex-direction: column; gap: 2px; }
  .msg.fresh { animation: msgIn .26s cubic-bezier(.2,.9,.3,1.15) both; }
  .msg.own { align-self: flex-end; align-items: flex-end; transform-origin: bottom right; }
  .msg.other { align-self: flex-start; align-items: flex-start; transform-origin: bottom left; }
  .meta { font-size: 10px; color: #718096; display: flex; align-items: center; gap: 5px; }
  .meta strong { color: #1d3557; font-size: 11px; }
  .bubble {
    padding: 8px 11px; border-radius: 14px; font-size: 13px; line-height: 1.4;
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  .msg.other .bubble { background: #fff; border: 1px solid #e4eaf2; border-top-left-radius: 4px; }
  .msg.own .bubble { background: #1769d2; color: #fff; border-top-right-radius: 4px; }
  .msg.mentioned .bubble { border-color: #f0b429; background: #fffaf0; }
  .msg.mentioned.fresh .bubble { animation: flash 1.2s ease-out 1; }
  .tag { color: #1769d2; background: #e8f2ff; border-radius: 4px; padding: 0 3px; font-weight: 600; }
  .tag.me { color: #7a5200; background: #ffe9a8; }
  .msg.own .tag { color: #fff; background: rgba(255,255,255,.24); }
  .time { font-size: 9px; color: #9aa6b5; }

  .composer-wrap { position: relative; flex: none; }
  .composer { display: flex; gap: 8px; padding: 8px 10px; background: #fff; border-top: 1px solid #edf0f5; align-items: flex-end; }
  .composer textarea {
    flex: 1; resize: none; border: 1px solid #d5dde8; border-radius: 12px; padding: 8px 11px;
    font-size: 13px; font-family: inherit; color: #172b4d; outline: none; max-height: 96px; line-height: 1.35;
    transition: border-color .15s, box-shadow .15s;
  }
  .composer textarea:focus { border-color: #1769d2; box-shadow: 0 0 0 3px rgba(23,105,210,.12); }
  .send {
    flex: none; width: 36px; height: 36px; border-radius: 50%; border: 0; background: #1769d2; color: #fff;
    cursor: pointer; display: grid; place-items: center; overflow: hidden;
    transition: background .15s, transform .15s;
  }
  .send:hover:not(:disabled) { background: #0f56b5; transform: scale(1.08); }
  .send:active:not(:disabled) { transform: scale(.92); }
  .send svg { transition: transform .2s; }
  .send.fly svg { animation: fly .45s ease; }
  .send:disabled { opacity: .5; cursor: default; }

  .mention-menu {
    position: absolute; left: 10px; right: 10px; bottom: calc(100% + 4px); z-index: 4;
    background: #fff; border: 1px solid #dbe5f2; border-radius: 12px; overflow: hidden;
    box-shadow: 0 10px 28px rgba(15,35,65,.18); animation: menuIn .16s ease-out both;
  }
  .mention-menu[hidden] { display: none; }
  .mention-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; font-size: 12px; cursor: pointer; transition: background .12s; }
  .mention-item.on { background: #e8f2ff; }
  .mention-av {
    flex: none; width: 22px; height: 22px; border-radius: 50%; background: #1769d2; color: #fff;
    display: grid; place-items: center; font-size: 10px; font-weight: 700;
  }
  .mention-item strong { color: #1d3557; font-weight: 600; }
  .mention-role { margin-left: auto; color: #9aa6b5; font-size: 10px; }

  .pane { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  .pane.busy { opacity: .6; pointer-events: none; }
  .pane > .chat { flex: 1; min-height: 0; }
  .pane > .notice { margin: 10px 12px 0; flex: none; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; }
  .scroll > .notice { margin: 10px 12px 0; }

  .sub-head, .list-head, .room-head {
    flex: none; display: flex; align-items: center; gap: 8px; padding: 9px 12px;
    background: #fff; border-bottom: 1px solid #edf0f5;
  }
  .list-head { justify-content: space-between; }
  .list-head h3 { margin: 0; font-size: 14px; color: #1d3557; }
  .sub-head strong { font-size: 13px; color: #1d3557; }
  .room-title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .room-title strong { font-size: 13px; color: #1d3557; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .room-title span { font-size: 10px; color: #8a97a8; }
  .icon-btn {
    flex: none; width: 28px; height: 28px; border: 0; border-radius: 8px; background: #eef2f7; color: #1769d2;
    font-size: 17px; line-height: 1; cursor: pointer; font-family: inherit; font-weight: 700;
    transition: background .15s, transform .15s;
  }
  .icon-btn:hover { background: #dde9f8; }
  .icon-btn:active { transform: scale(.92); }
  .icon-btn.back:hover { transform: translateX(-2px); }
  .btn-sm {
    border: 0; border-radius: 9px; padding: 6px 11px; background: #1769d2; color: #fff; font-size: 12px;
    font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s, transform .15s;
  }
  .btn-sm:hover { background: #0f56b5; transform: translateY(-1px); }
  .btn-sm:active { transform: scale(.95); }
  .btn-xs {
    flex: none; border: 0; border-radius: 8px; padding: 5px 8px; background: #eef2f7; color: #4a5568;
    font-size: 10px; cursor: pointer; font-family: inherit; transition: background .15s, color .15s;
  }
  .btn-xs:hover { background: #dde9f8; }
  .btn-xs.danger, button.secondary.danger { background: #fdecec; color: #a12727; }
  .btn-xs.danger:hover, button.secondary.danger:hover { background: #f9d6d6; }
  .ask, .btn-xs.danger.ask, button.secondary.danger.ask { background: #d64545 !important; color: #fff !important; }

  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; background: #fff; }
  .row {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: 0;
    border-bottom: 1px solid #eef1f6; background: #fff; cursor: pointer; text-align: left;
    font-family: inherit; flex: none; animation: viewIn .25s ease-out both;
    transition: background .15s, transform .15s;
  }
  .row:hover { background: #f0f6ff; }
  .row:active { transform: scale(.99); }
  .row-av {
    flex: none; width: 36px; height: 36px; border-radius: 50%; background: #1769d2; color: #fff;
    display: grid; place-items: center; font-weight: 700; font-size: 14px;
  }
  .row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .row-main strong { font-size: 13px; color: #1d3557; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-main small { font-size: 11px; color: #8a97a8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-side { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .row-side small { font-size: 10px; color: #9aa6b5; }
  .unread {
    min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e5484d; color: #fff;
    font-size: 10px; font-weight: 700; display: grid; place-items: center;
    animation: badgePop .3s cubic-bezier(.2,.9,.3,1.4);
  }
  .unread.tag { background: #f0a30a; }

  .form { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
  .form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4a5568; font-weight: 600; }
  .form input, .form textarea {
    border: 1px solid #d5dde8; border-radius: 9px; padding: 9px 10px; font-size: 13px; font-family: inherit;
    color: #172b4d; background: #fff; outline: none; resize: none; transition: border-color .15s, box-shadow .15s;
  }
  .form input:focus, .form textarea:focus { border-color: #1769d2; box-shadow: 0 0 0 3px rgba(23,105,210,.15); }
  .section-title {
    display: flex; align-items: center; gap: 6px; padding: 10px 12px 4px; font-size: 10px;
    text-transform: uppercase; letter-spacing: .4px; color: #9aa6b5; font-weight: 700;
  }
  .form .section-title { padding: 0; }
  .count-chip { background: #e8f2ff; color: #1769d2; border-radius: 8px; padding: 1px 7px; font-size: 10px; }

  .picker { display: flex; flex-direction: column; gap: 6px; }
  .picker-q {
    border: 1px solid #d5dde8; border-radius: 9px; padding: 8px 10px; font-size: 12px; font-family: inherit;
    color: #172b4d; background: #fff; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .picker-q:focus { border-color: #1769d2; box-shadow: 0 0 0 3px rgba(23,105,210,.15); }
  .pick-list { max-height: 176px; overflow-y: auto; border: 1px solid #e4eaf2; border-radius: 10px; background: #fff; }
  .picker.single { padding: 10px 12px; }
  .picker.single .pick-list { max-height: none; }
  .pick-row {
    display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 10px; border: 0; background: #fff;
    cursor: pointer; font-family: inherit; text-align: left; transition: background .15s;
  }
  .pick-row:hover { background: #f0f6ff; }
  .pick-row.on { background: #e8f2ff; }
  .pick-name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .pick-name strong { font-size: 12px; color: #1d3557; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pick-name small { font-size: 10px; color: #8a97a8; }
  .tick { flex: none; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #cbd5e3; transition: all .18s; }
  .pick-row.on .tick { background: #1769d2; border-color: #1769d2; box-shadow: inset 0 0 0 3px #fff; transform: scale(1.08); }
  .picker.single .tick { display: none; }
  .pick-empty { padding: 14px; text-align: center; font-size: 12px; color: #9aa6b5; }

  .about { padding: 12px; }
  .about h3 { margin: 0 0 4px; font-size: 14px; color: #1d3557; }
  .about p { margin: 0; font-size: 12px; color: #718096; }
  .members { background: #fff; border-top: 1px solid #eef1f6; }
  .member-row {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #eef1f6;
    animation: viewIn .25s ease-out both;
  }
  .role-chip { flex: none; font-size: 9px; padding: 2px 7px; border-radius: 8px; background: #e8f2ff; color: #1769d2; font-weight: 700; }
  .role-chip.owner { background: #fff3c4; color: #7a5200; }
  .actions { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
  .add-slot { display: flex; flex-direction: column; gap: 8px; animation: viewIn .22s ease-out both; }
  .add-slot[hidden] { display: none; }

  .admin-head { flex: none; padding: 8px 12px; background: #fff; border-bottom: 1px solid #edf0f5; }
  .admin-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .admin-pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .admin-tools { flex: none; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: #fff; border-bottom: 1px solid #edf0f5; }
  .admin-sum { font-size: 10px; color: #8a97a8; }
  .admin-pane > .notice { margin: 8px 12px 0; flex: none; }
  .staff-row { flex-wrap: wrap; }
  .staff-actions { flex-basis: 100%; display: flex; gap: 6px; padding-left: 30px; }
  .role-chip.off { background: #fdecec; color: #a12727; }
  .role-chip.pending { background: #eef2f7; color: #718096; }
  .admin-import { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
  .import-actions { display: flex; gap: 8px; }
  .import-actions .primary { width: auto; flex: 1; }
  .report { display: flex; flex-direction: column; gap: 8px; animation: viewIn .25s ease-out both; }
  .report[hidden] { display: none; }
  .rep-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #9aa6b5; }
  .rep-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .rep-chip { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 8px; background: #eef2f7; color: #4a5568; flex: none; }
  .rep-chip.baru { background: #e6f6ec; color: #1f7a45; }
  .rep-chip.ubah { background: #e8f2ff; color: #1769d2; }
  .rep-chip.gagal { background: #fdecec; color: #a12727; }
  .rep-list { background: #fff; border: 1px solid #e4eaf2; border-radius: 10px; max-height: 220px; overflow-y: auto; }
  .rep-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid #eef1f6; }
  .rep-info { min-width: 0; display: flex; flex-direction: column; }
  .rep-info strong { font-size: 12px; color: #1d3557; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rep-info small { font-size: 10px; color: #8a97a8; }
  .rep-more { font-size: 11px; color: #8a97a8; text-align: center; }

  .avatar, .mention-av, .row-av, .msg-av { position: relative; overflow: hidden; }
  .av-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  .has-img { color: transparent; }
  .msg-av {
    flex: none; width: 16px; height: 16px; border-radius: 50%; background: #1769d2; color: #fff;
    display: grid; place-items: center; font-size: 8px; font-weight: 700;
  }
  .avatar-actions { display: flex; gap: 6px; margin-bottom: 6px; }
  .profile > .notice { align-self: stretch; margin-bottom: 6px; }
  .profile > .secondary { align-self: stretch; margin-top: 6px; }
  .link-btn {
    align-self: center; background: none; border: 0; padding: 4px 8px; font-size: 12px; color: #1769d2;
    cursor: pointer; border-radius: 6px; transition: background .12s;
  }
  .link-btn:hover { background: #e8f2ff; }
  .pass-field[hidden] { display: none; }
  .form-title { margin: 0; font-size: 16px; color: #1d3557; text-align: center; }
  .primary-xs { background: #1769d2; color: #fff; }
  .primary-xs:hover { background: #135db9; }
  .cred-host:empty { display: none; }
  .cred-host { padding: 8px 12px 0; flex: none; }
  .cred-card { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid #cfe0f7; border-radius: 10px; padding: 10px; animation: viewIn .25s ease-out both; }
  .cred-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .cred-head strong { font-size: 11px; color: #1d3557; text-transform: uppercase; letter-spacing: .4px; }
  .cred-list { display: flex; flex-direction: column; max-height: 180px; overflow-y: auto; }
  .cred-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid #eef1f6; }
  .cred-row:first-child { border-top: 0; }
  .cred-info { min-width: 0; flex: 1; display: flex; flex-direction: column; }
  .cred-info strong { font-size: 12px; color: #1d3557; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cred-info small { font-size: 10px; color: #8a97a8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cred-pass { flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; font-weight: 700; color: #1d3557; background: #eef4fc; padding: 3px 7px; border-radius: 6px; user-select: all; }
  .cred-tools { display: flex; gap: 6px; }
  .rep-chip.hapus { background: #fdecec; color: #a12727; }
  .rep-chip.akun { background: #fff3c4; color: #7a5200; }
  .rep-note { font-size: 11px; color: #7a5200; background: #fff8dc; border-radius: 8px; padding: 7px 10px; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  }
`;
