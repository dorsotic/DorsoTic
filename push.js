"use strict";
/* Push-уведомления DorsoTic.
   Работает только внутри Android-приложения (Capacitor). В обычном браузере ничего не делает.
   Использует глобальные db, toast, go из app.js. */
(() => {
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;
  const P = cap.Plugins && cap.Plugins.PushNotifications;
  if (!P) { console.warn("PushNotifications plugin not found: сделай npx cap sync и пересобери APK"); return; }

  const KEY = "pushTok";
  let ready = false, busy = false;

  const getTok = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const setTok = t => { try { localStorage.setItem(KEY, t); } catch {} };

  async function setup() {
    if (ready) return; ready = true;
    /* каналы Android: на них настраивается звук и всплывающие уведомления */
    try {
      await P.createChannel({id:"forum", name:"Форум", description:"Новые посты и ответы", importance:4, visibility:1});
      await P.createChannel({id:"requests", name:"Заявки", description:"Новые заявки для персонала", importance:5, visibility:1});
    } catch (e) { console.warn("createChannel", e); }

    P.addListener("registration", async t => {
      setTok(t.value);
      const { error } = await db.rpc("register_device", {p_token:t.value});
      if (error) console.error("register_device", error);
    });
    P.addListener("registrationError", e => console.error("Push registration error", e));

    /* приложение открыто: система сама не показывает уведомление, поэтому показываем плашку */
    P.addListener("pushNotificationReceived", n => {
      const t = [n.title, n.body].filter(Boolean).join(": ");
      if (t) toast(t);
    });

    /* тап по уведомлению: открываем нужную страницу (forum/p/<id> или staff) */
    P.addListener("pushNotificationActionPerformed", a => {
      const r = a && a.notification && a.notification.data && a.notification.data.route;
      if (typeof r === "string" && /^[a-z0-9\/_-]{1,80}$/i.test(r)) setTimeout(() => go(r), 1500);
    });
  }

  async function enable() {
    if (busy) return; busy = true;
    try {
      await setup();
      let st = await P.checkPermissions();
      if (st.receive === "prompt" || st.receive === "prompt-with-rationale") st = await P.requestPermissions();
      if (st.receive !== "granted") return;
      await P.register();
    } catch (e) { console.error("push enable", e); }
    finally { busy = false; }
  }

  /* вход в аккаунт (форум или персонал) → привязываем устройство к пользователю;
     выход → отвязываем. Вызовы вынесены в setTimeout, чтобы не блокировать supabase-js внутри колбэка. */
  db.auth.onAuthStateChange((ev, s) => {
    if (s && s.user && (ev === "SIGNED_IN" || ev === "INITIAL_SESSION")) setTimeout(enable, 800);
    if (ev === "SIGNED_OUT") {
      const t = getTok();
      if (t) setTimeout(() => db.rpc("unregister_device", {p_token:t}), 0);
    }
  });
})();
