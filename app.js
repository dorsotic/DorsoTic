"use strict";
const SB_URL = "https://swdmjwgwripgpcnglhse.supabase.co";
const SB_KEY = "sb_publishable_hv4OhCNL1n8A5pbs526FpQ_hX7o6xmb";
const SITE_VERSION = "2.20-6b";
const TITLE = "Достижения DOORS: помощь с ачивками — DorsoTic";
const ROLE = {moderator:"Модератор", admin:"Админ", owner:"Владелец"};
const ST = {new:"Новая", in_progress:"Выполняется", waiting:"Ожидание", closed:"Закрыта"};
const PL = {discord:"Discord", telegram:"Telegram"};
let FPATH = "";
const ROUTES = ["home", "info", "team", "forum", "market", "update", "staff", "login"];
const WARN = "Перед тем как отправить заявку, убедитесь, что вы выбрали достижение, которое нужно. Просим вас не выбирать случайное достижение и не писать в комментарии о другом, которого нет в списке. Если вы так поступите, ваша заявка будет удалена.";

const $ = id => document.getElementById(id);
const h = (t, p = {}, ...k) => {
  const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) { if (a === "class") e.className = v; else if (a.startsWith("on")) e[a] = v; else e.setAttribute(a, v); }
  e.append(...k.flat().filter(x => x != null && x !== false));
  return e;
};
const fld = (l, el) => h("label", {}, l, el);
const fmt = d => new Date(d).toLocaleString("ru-RU", {dateStyle:"short", timeStyle:"short"});
const ago = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 6e4)); if (m < 60) return m + " мин"; const x = Math.round(m / 60); return x < 48 ? x + " ч" : Math.round(x / 24) + " дн"; };
const stars = v => h("span", {class:"stars", style:`--v:${(v || 0) / 5 * 100}%`}, "★★★★★");
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const toks = () => store.get("tk", []);
const saveToks = a => store.set("tk", a.slice(-5));
function toast(text, bad) {
  let box = $("toasts"); if (!box) { box = h("div", {id:"toasts"}); document.body.append(box); }
  const t = h("div", {class:"toast" + (bad ? " bad" : ""), role:"status", "aria-live":"polite"}, text);
  box.append(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 220); }, 3300);
}
const copy = (t, ok) => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast(ok), () => toast("Не удалось скопировать.", 1));

/* Модальное окно. Возвращает null при отмене; true/строку при подтверждении */
function modal({title, text, input, body, ok = "Ок", no = "Отмена"}) {
  return new Promise(res => {
    const inp = input ? h("input", {maxlength:input.max || 300, placeholder:input.ph || "", "aria-label":title}) : null;
    const fin = v => { document.removeEventListener("keydown", esc); bd.classList.add("out"); setTimeout(() => bd.remove(), 170); res(v); };
    const esc = e => { if (e.key === "Escape") fin(null); };
    const bd = h("div", {class:"bd", onclick:e => { if (e.target === bd) fin(null); }},
      h("div", {class:"mdl", role:"dialog", "aria-modal":"true", "aria-label":title}, h("h2", {}, title), text ? h("p", {}, text) : null, inp, body,
        h("div", {class:"acts"}, h("button", {class:"ghost", onclick:() => fin(null)}, no),
          h("button", {onclick:() => fin(inp ? inp.value.trim() : body ? body.value : true)}, ok))));
    document.addEventListener("keydown", esc); document.body.append(bd);
    (inp || bd.querySelector(".acts button:last-child")).focus();
  });
}

if (typeof supabase === "undefined") {
  $("app").replaceChildren(h("div", {style:"text-align:center;padding:3rem 1rem"}, h("h1", {}, "Не загрузилось"), h("p", {class:"sub"}, "Не удалось подключить базу данных. Проверь интернет, отключи блокировщик рекламы и обнови страницу."), h("button", {onclick:() => location.reload()}, "Обновить")));
  throw new Error("supabase not loaded");
}
const db = supabase.createClient(SB_URL, SB_KEY);
let me = null, profiles = {}, tab = "requests", rf = "new", msub = "team", timer = null, lastNew = null;
async function loadMe() {
  me = null;

  const { data: authData, error: authError } =
    await db.auth.getUser();

  if (authError) {
    console.error("Auth error:", authError);
    throw new Error("Ошибка авторизации: " + authError.message);
  }

  const user = authData?.user;
  if (!user) return null;

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Profile error:", error);
    throw new Error("Ошибка загрузки профиля: " + error.message);
  }

  if (!data) return null; // обычный пользователь форума, не персонал

  me = data;

  const { data: list, error: listError } = await db
    .from("profiles")
    .select("id,nickname,role");
  
  if (listError) {
    console.error("Profiles list error:", listError);
    profiles = { [data.id]: data };
  } else {
    profiles = Object.fromEntries(
      (list || []).map(p => [p.id, p])
    );
  }
  return me;
}
const ICON_EXT = ["png", "svg", "webp", "jpg", "jpeg", "gif"]; // иконки меню: icons/<вкладка>.<формат>; пока файла нет, показывается символ
const navIcon = (v, sym) => {
  const s = h("span", {class:"ni", "aria-hidden":"true"}, sym), im = new Image(); let i = 0; im.alt = ""; im.className = "ic";
  im.onload = () => s.replaceChildren(im);
  im.onerror = () => { if (++i < ICON_EXT.length) im.src = `icons/${v}.${ICON_EXT[i]}`; };
  im.src = `icons/${v}.${ICON_EXT[0]}`; return s;
};
function drawNav() {
  const nb = (v, sym, l) => h("button", {"data-v":v, onclick:() => go(v)}, navIcon(v, sym), h("span", {}, l));
  $("nav").replaceChildren(nb("home", "✎", "Заявка"), nb("info", "?", "Инфо"), nb("team", "★", "Помощники"), nb("forum", "☰", "Форум"), nb("market", "◈", "Маркет"), nb("update", "◷", "Обновление"), ...(me ? [nb("staff", "☺", "Панель")] : []));
  $("fl").replaceChildren(...(me ? [] : [h("a", {href:"#login", class:"lk", onclick:e => { e.preventDefault(); go("login"); }}, "Вход для персонала")]));
}
/* общая шторка: закрытие по фону, Escape и с анимацией */
function openSheet(el, onClose) {
  const bd = h("div", {class:"sheet-bd hs", onclick:e => { if (e.target === bd) closeSheet(); }}, el);
  bd._onClose = onClose; document.body.append(bd); document.body.classList.add("lock");
  const esc = e => { if (e.key === "Escape") closeSheet(); };
  bd._esc = esc; document.addEventListener("keydown", esc);
  return bd;
}
function closeSheet() {
  const bd = document.querySelector(".sheet-bd.hs"); if (!bd || bd.classList.contains("out")) return;
  document.removeEventListener("keydown", bd._esc); document.body.classList.remove("lock"); bd.classList.add("out");
  setTimeout(() => bd.remove(), 200); bd._onClose?.();
}
async function drawFoot() {
  const { data } = await db.rpc("service_rating");
  const ok = !!data?.avg;
  $("rate").replaceChildren(stars(ok ? data.avg : 0), ok ? ` ${data.avg} (${data.count})` : " нет оценок");
  $("fr").replaceChildren(ok ? h("div", {}, stars(data.avg), ` ${data.avg} из 5 · отзывов: ${data.count}`) : "Пока нет отзывов");
}
async function go(v) {
  const full = String(v); v = full.split("/")[0]; FPATH = full.slice(v.length + 1);
  if (!ROUTES.includes(v)) { v = "home"; FPATH = ""; }
  if (v === "staff" && !me) v = "login";
  document.getElementById("fbar")?.remove(); document.querySelector(".sheet-bd")?.remove(); document.body.classList.remove("lock");
  const box = h("div");
  $("app").className = (v === "staff" ? "wide " : "") + "v-" + v;
  $("app").replaceChildren(box);
  document.querySelectorAll("#nav button").forEach(b => { const on = b.dataset.v === v; b.classList.toggle("cur", on); on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"); if (on) try { b.scrollIntoView({inline:"center", block:"nearest"}); } catch (_) {} });
  const hv = v === "forum" && FPATH ? "forum/" + FPATH : v; if (location.hash.slice(1) !== hv) history.pushState(null, "", "#" + hv);
  window.scrollTo(0, 0); clearInterval(timer); document.title = TITLE;
  try {
    if (v === "home") await home(box); else if (v === "login") login(box); else if (v === "info") how(box);
    else if (v === "team") await team(box); else if (v === "forum") await forum(box); else if (v === "update") updateView(box); else if (v === "market") marketView(box);
    else await staffView(box);
  } catch (e) { console.error(e); box.replaceChildren(h("h1", {}, "Ошибка"), h("p", {class:"sub"}, "Не удалось загрузить страницу. Обнови её.")); }
}


/* ---------- мелкие помощники для анимаций ---------- */
const initial = n => (String(n || "?").trim()[0] || "?").toUpperCase();
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function countUp(el, to) {
  const v = Number(to);
  if (!isFinite(v) || reduceMotion()) { el.textContent = String(to); return; }
  const dec = (String(to).split(".")[1] || "").length, t0 = performance.now(), D = 900;
  const f = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = k < 1 ? (v * e).toFixed(dec) : String(to); if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}
const tile = (label, val) => { const n = h("span", {}, "0"); countUp(n, val); return h("div", {class:"stat"}, n, label); };

/* ---------- маркет (заглушка) ---------- */
function marketView(box) {
  document.title = "Маркет — " + TITLE;
  box.append(h("h1", {}, "Маркет"), h("p", {class:"sub"}, "Раздел в разработке"),
    h("div", {class:"door soon"}, h("b", {}, "Скоро здесь появится маркет"), h("p", {class:"meta"}, "Следи за новостями DorsoNews."),
      h("a", {class:"chip-link", href:"https://t.me/Doors_Roblox_Chat_RU", target:"_blank", rel:"noopener noreferrer"}, "Лучший чат по DOORS · t.me/Doors_Roblox_Chat_RU")));
}

/* ---------- обновление: The Candy Vault ---------- */
const CV = {start:"2026-10-22T21:00:00+03:00", end:"2026-11-09T07:55:00+03:00"}; // время МСК (UTC+3)
function updateView(box) {
  const t0 = Date.parse(CV.start), t1 = Date.parse(CV.end);
  const nums = ["дней", "часов", "минут", "секунд"].map(l => { const n = h("span", {}, "00"); return {n, el:h("div", {class:"stat"}, n, l)}; });
  const cap = h("div", {class:"sub", style:"margin:.2rem 0 0"}), state = h("div", {class:"warning-caption", style:"margin-top:.9rem"}), pb = h("i"), pbar = h("div", {class:"bar cvbar", hidden:""}, pb);
  const when = d => new Date(d).toLocaleString("ru-RU", {dateStyle:"long", timeStyle:"short"});
  const tick = () => {
    const now = Date.now(); let left, st, c;
    if (now < t0) { left = t0 - now; st = "До начала обновления"; c = "Старт: " + when(t0); }
    else if (now < t1) { left = t1 - now; st = "Обновление уже идёт!"; c = "Событие закончится: " + when(t1); }
    else { left = 0; st = "Событие завершилось"; c = "Закончилось: " + when(t1); }
    const s = Math.floor(left / 1000), v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
    nums.forEach((x, i) => x.n.textContent = String(v[i]).padStart(2, "0"));
    state.textContent = st; cap.textContent = c;
    const run = now >= t0 && now < t1; pbar.hidden = !run; if (run) pb.style.width = ((now - t0) / (t1 - t0) * 100).toFixed(2) + "%";
    state.classList.toggle("live", run);
  };
  tick(); clearInterval(timer); timer = setInterval(tick, 1000);
  document.title = "The Candy Vault — " + TITLE;
  box.append(
    h("h1", {}, "The Candy Vault"),
    h("p", {class:"sub"}, "Новое обновление DOORS"),
    h("div", {class:"door cv"},
      h("img", {src:"candy-vault.webp", alt:"The Candy Vault — DOORS", width:"768", height:"432", class:"cv-img"}),
      state,
      h("div", {class:"stats cd"}, nums.map(x => x.el)),
      pbar, cap,
      h("p", {class:"meta", style:"text-align:center;margin-top:.7rem"}, "Подробности скоро…")
    )
  );
}

/* ---------- выбор достижений ---------- */
function picker(items, max = 5) {
  const sel = [], q = h("input", {placeholder:"Поиск достижения…", "aria-label":"Поиск достижения"});
  const ul = h("div", {class:"pk-list", role:"listbox", "aria-multiselectable":"true"}), tags = h("div"), cnt = h("div", {class:"meta"});
  const tg = n => {
    const i = sel.indexOf(n);
    if (i >= 0) sel.splice(i, 1); else if (sel.length < max) sel.push(n); else return toast(`Не больше ${max} достижений в одной заявке`, 1);
    draw();
  };
  const draw = () => {
    const s = q.value.trim().toLowerCase(), m = items.filter(n => n.toLowerCase().includes(s));
    cnt.textContent = `Выбрано: ${sel.length} из ${max}`;
    tags.replaceChildren(...sel.map(n => h("span", {class:"tag"}, n, h("button", {type:"button", class:"ghost", "aria-label":"Убрать " + n, onclick:() => tg(n)}, "×"))));
    ul.replaceChildren(...(m.length ? m.map(n => h("div", {class:"pk-i" + (sel.includes(n) ? " on" : ""), role:"option", "aria-selected":String(sel.includes(n)), tabindex:"0", onclick:() => tg(n), onkeydown:e => { if (e.key === "Enter") tg(n); }}, (sel.includes(n) ? "✓ " : "") + n)) : [h("div", {class:"pk-i empty"}, items.length ? "Ничего не найдено" : "Список достижений пока пуст")]));
  };
  q.oninput = draw; draw();
  return {el:h("div", {}, q, ul, cnt, tags), get:() => [...sel], clear:() => { sel.length = 0; draw(); }};
}

/* ---------- главная ---------- */
async function home(box) {
  const { data: list } = await db.from("achievements").select("name").order("name");
  const names = (list || []).map(a => a.name), nameSet = new Set(names);
  const nick = h("input", {maxlength:20, placeholder:"Ник в Roblox", autocomplete:"off"}), pk = picker(names);
  const plat = h("select", {}, h("option", {value:"discord"}, "Discord"), h("option", {value:"telegram"}, "Telegram"));
  const un = h("input", {maxlength:33, placeholder:"@username", autocomplete:"off"}), note = h("textarea", {maxlength:300});
  const reward = h("input", {maxlength:100, placeholder:"Например: Бочка, зеркало"});
  const site = h("input", {class:"hp", tabindex:"-1", autocomplete:"off", "aria-hidden":"true"});
  const msg = h("div", {class:"msg", role:"status"}), mine = h("div"), btn = h("button", {class:"go"}, "Отправить заявку");
  btn.onclick = async () => {
    msg.className = "msg err"; msg.textContent = "";
    if (site.value) return;
    const u = un.value.trim().replace(/^@/, ""), chosen = pk.get(), nk = nick.value.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(nk)) { msg.textContent = "Ник Roblox: 3–20 символов (буквы, цифры, _)."; return; }
    if (!chosen.length || !chosen.every(n => nameSet.has(n))) { msg.textContent = "Выбери хотя бы одно достижение из списка."; return; }
    const okU = plat.value === "telegram" ? /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u) : /^[A-Za-z0-9_.]{2,32}$/.test(u);
    if (!okU) { msg.textContent = plat.value === "telegram" ? "Telegram: от 5 символов, начинается с буквы, только буквы/цифры/_." : "Discord: буквы, цифры, _ и точка."; return; }
    if (Date.now() - store.get("last", 0) < 60000) { msg.textContent = "Подожди минуту перед следующей заявкой."; return; }
    // предупреждение перед отправкой
    const go2 = await modal({title:"Проверь заявку", text:WARN, ok:"Продолжить", no:"Изменить заявку"});
    if (go2 === null) return;
    btn.disabled = true;
    const token = crypto.randomUUID();
    const { error } = await db.from("requests").insert({token, nickname:nk, achievement:chosen.join("; "), reward:reward.value.trim() || null, platform:plat.value, username:"@" + u, note:note.value.trim() || null});
    btn.disabled = false;
    if (error) { msg.textContent = error.code === "P0001" ? error.message : "Не получилось отправить. Попробуй позже."; return; }
    saveToks([...toks(), token]); store.set("last", Date.now());
    [nick, un, note, reward].forEach(i => i.value = ""); pk.clear();
    msg.className = "msg good"; msg.textContent = "Заявка отправлена. С тобой свяжутся в выбранном мессенджере.";
    drawMine(mine);
  };
  const ps = h("div", {class:"stats"}, ...[0, 1, 2, 3].map(() => h("div", {class:"stat sk-tile"}, h("span", {}, "\u00a0"), "\u00a0")));
  db.rpc("public_stats").then(({ data: d }) => {
    if (!d) return;
    ps.replaceChildren(tile("Выполнено", d.closed), tile("В работе", d.open), tile("Помощников", d.staff), tile(d.reviews ? `Оценка (${d.reviews})` : "Оценка", d.avg || "—"));
  });
  const fsec = (n, t, ...k) => h("section", {class:"fs"}, h("div", {class:"fs-h"}, h("i", {}, String(n)), h("span", {}, t)), ...k);
  box.append(h("div", {class:"hero"}, h("div", {class:"eyebrow"}, "DOORS · Roblox"), h("h1", {}, "DorsoTic"), h("p", {class:"sub"}, "Помощь с достижениями. Оставь заявку, и с тобой свяжется помощник.")), ps,
    h("div", {class:"door form"},
      fsec(1, "Кто ты", fld("Ник в Roblox", nick)),
      fsec(2, "Какие достижения нужны (до 5)", pk.el),
      fsec(3, "Как с тобой связаться", h("div", {class:"row"}, fld("Мессенджер", plat), fld("Юзернейм", un))),
      fsec(4, "Награда и комментарий", fld("Награда за помощь (по желанию, только внутриигровая). С наградой заявку берут быстрее", reward), fld("Комментарий (по желанию)", note)),
      site, btn, msg,
      h("div", {class:"meta"}, "Заявки, которые не будут выполнены в течение 3 дней из-за проблем со стороны клиента, будут удалены.")), mine);
  drawMine(mine);
}
function reviewForm(t, done) {
  let v = 0; const bs = [], pick = h("div", {class:"pick"});
  const paint = n => bs.forEach((x, j) => x.classList.toggle("on", j < n));
  for (let i = 1; i <= 5; i++) { const b = h("button", {type:"button", title:i + " из 5", "aria-label":i + " из 5", onclick:() => { v = i; paint(i); }}, "★"); bs.push(b); pick.append(b); }
  const cm = h("textarea", {maxlength:300, placeholder:"Комментарий (по желанию)"});
  return h("div", {}, h("div", {class:"meta"}, "Оцени помощь:"), pick, cm, h("div", {class:"acts"}, h("button", {onclick:async () => {
    if (!v) return toast("Выбери оценку от 1 до 5 звёзд.", 1);
    const { error } = await db.rpc("submit_review", {p_token:t, p_stars:v, p_comment:cm.value.trim() || null});
    if (error) return toast(error.message, 1);
    toast("Спасибо за отзыв!"); done();
  }}, "Отправить отзыв")));
}
async function complain(t) {
  const text = await modal({title:"Пожаловаться на помощника", text:"Опиши, что случилось (5–500 символов). Жалоба уйдёт владельцу.", input:{max:500, ph:"Что произошло?"}, ok:"Отправить"});
  if (!text) return;
  const { error } = await db.rpc("submit_complaint", {p_token:t, p_text:text});
  toast(error ? error.message : "Жалоба отправлена.", !!error);
}
const track = st => { const i = {new:0, in_progress:1, waiting:1, closed:2}[st] ?? 0; return h("div", {class:"trk " + st, "aria-hidden":"true"}, ["Отправлена", st === "waiting" ? "Пауза" : "В работе", "Готово"].map((l, j) => h("span", {class:j <= i ? "on" : ""}, l))); };
async function drawMine(box) {
  const all = toks();
  const res = await Promise.all(all.map(t => db.rpc("request_status", {p_token:t}).then(r => [t, r])));
  const alive = res.filter(([, r]) => r.error || r.data?.[0]).map(([t]) => t);
  if (alive.length < all.length) { saveToks(alive); toast("Часть заявок удалена или истекла и убрана из списка."); }
  const items = [];
  for (const [t, r] of res) {
    const s = r.data?.[0]; if (!s) continue;
    const c = h("div", {class:"card " + s.status}, h("b", {}, s.achievement.split("; ").join(" · ")), track(s.status),
      h("div", {class:"meta"}, h("span", {class:"pill " + s.status}, ST[s.status]), s.staff ? ` помощник: ${s.staff}` : ""));
    if (s.status === "waiting") c.append(h("div", {class:"meta"}, "Заявка на паузе. Помощник вернётся к ней, когда будет готов."));
    const a = h("div", {class:"acts"});
    if (s.status !== "closed") a.append(h("button", {class:"ghost", onclick:() => copy(location.origin + location.pathname + "#t=" + t, "Ссылка скопирована. Открой её на другом устройстве.")}, "Ссылка на заявку"));
    if (s.staff) a.append(h("button", {class:"ghost", onclick:() => complain(t)}, "Пожаловаться"));
    if (s.status === "new") a.append(h("button", {class:"ghost", onclick:async () => {
      if (await modal({title:"Отозвать заявку?", ok:"Отозвать"}) === null) return;
      const { error } = await db.rpc("cancel_request", {p_token:t});
      if (error) return toast(error.message, 1);
      saveToks(toks().filter(x => x !== t)); toast("Заявка отозвана."); drawMine(box);
    }}, "Отозвать заявку"));
    c.append(a);
    if (s.status === "closed") c.append(s.reviewed ? h("div", {class:"meta"}, "Спасибо за отзыв!") : reviewForm(t, () => { drawMine(box); drawFoot(); }));
    items.push(c);
  }
  box.replaceChildren(...(items.length ? [h("h2", {}, "Мои заявки"), ...items] : []));
}

/* ---------- инфо и помощники ---------- */
function how(box) {
  const S = [["Выбери достижения", "Найди нужные в списке с поиском (до пяти в одной заявке)."], ["Расскажи, как связаться", "Укажи Discord или Telegram и юзернейм. По желанию добавь награду: с ней заявку берут быстрее."], ["Помощник берёт заявку", "Статус меняется на «Выполняется», и помощник пишет тебе. Пока заявку никто не взял, её можно отозвать."], ["Играете вместе", "Договоритесь о времени, зайдите в DOORS и выполните достижения."], ["Оцени помощь", "Когда заявка закрыта, поставь звёзды. Из оценок складывается рейтинг."]];
  const F = [["Нужен ли аккаунт?", "Нет. Достаточно ника в Roblox и юзернейма в Discord или Telegram."], ["Просят ли пароль от Roblox?", "Никогда. Если кто-то просит пароль, не отдавай его и нажми «Пожаловаться»."], ["Можно ли платить реальными деньгами или робуксами?", "Нет. Награда только внутриигровая. Продажа достижений и буст за деньги нарушают правила Roblox, такие заявки удаляются."], ["Почему удалили мою заявку?", "Заявки удаляют, если выбраны случайные достижения, в комментарии просят о достижении, которого нет в списке, или если клиент не выходит на связь 3 дня."], ["Какие данные вы храните?", "Ник Roblox, юзернейм и текст заявки. Через 30 дней после закрытия заявка обезличивается. Данные не передаются третьим лицам."], ["Что значит «Ожидание»?", "Помощник поставил заявку на паузу, например, пока вы договариваетесь о времени."], ["Почему я не вижу заявку на другом устройстве?", "Статус хранится в браузере, где заявка была отправлена. Скопируй «Ссылку на заявку» и открой её на другом устройстве."]];
  box.append(h("h1", {}, "Как это работает"), h("p", {class:"sub"}, "Пять шагов от заявки до достижения."),
    ...S.map(([t, d], i) => h("div", {class:"card step"}, h("i", {class:"sn"}, String(i + 1)), h("div", {}, h("b", {}, t), h("div", {class:"meta"}, d)))),
    h("h2", {}, "Частые вопросы"), ...F.map(([q, a]) => h("details", {}, h("summary", {}, q), h("p", {}, a))));
}
let TEAM = null;
async function loadTeam() {
  if (!TEAM || Date.now() - TEAM.t > 30000) { const { data } = await db.rpc("staff_public"); TEAM = {t:Date.now(), data:data || []}; }
  return [...TEAM.data].sort((a, b) => (b.done || 0) - (a.done || 0) || (b.avg || 0) - (a.avg || 0));
}
async function team(box) {
  box.append(h("h1", {}, "Помощники"), h("p", {class:"sub"}, "Нажми на помощника, чтобы увидеть его статистику"));
  const list = h("div", {class:"tgrid"}, ...[0, 1, 2, 3].map(() => h("div", {class:"tm sk-card"}, h("div", {class:"av sk"}), h("div", {class:"tmi"}, h("div", {class:"sk l1"}), h("div", {class:"sk l2"})))));
  box.append(list);
  const rows = await loadTeam();
  if (!rows.length) { list.replaceChildren(h("p", {class:"empty"}, "Пока никого.")); return; }
  list.replaceChildren(...rows.map((x, i) => {
    const top = i < 3 && x.done > 0;
    return h("button", {type:"button", class:"tm" + (top ? " r" + (i + 1) : ""), "aria-label":"Открыть статистику: " + x.nickname, onclick:() => openHelper(x, true)},
      h("div", {class:"av tmav"}, initial(x.nickname), top ? h("em", {class:"rk"}, String(i + 1)) : null),
      h("div", {class:"tmi"}, h("div", {class:"tmn"}, h("b", {}, x.nickname), h("span", {class:"badge"}, ROLE[x.role] || "Помощник")),
        h("div", {class:"meta"}, `Выполнено: ${x.done}`),
        x.avg ? h("div", {class:"tmr"}, stars(x.avg), ` ${x.avg} (${x.reviews})`) : h("div", {class:"meta"}, "Пока нет отзывов")),
      h("span", {class:"chev", "aria-hidden":"true"}, "›"));
  }));
  if (FPATH) { let n = FPATH; try { n = decodeURIComponent(FPATH); } catch (_) {} const x = rows.find(r => String(r.nickname).toLowerCase() === n.toLowerCase()); if (x) openHelper(x, false); }
}
/* Окно со статистикой помощника. Базовые цифры берём из staff_public,
   расширенные (за день/неделю/месяц, распределение оценок, отзывы) — из staff_profile (см. helper-stats.sql); если функции нет, блок просто не показывается. */
function openHelper(x, push) {
  const nick = x.nickname; let pushed = !!push;
  if (push) history.pushState(null, "", "#team/" + encodeURIComponent(nick));
  const ext = h("div", {class:"hext"}, h("div", {class:"sk l2"}), h("div", {class:"sk l3"}), h("div", {class:"sk l2"}));
  const avg = x.avg ? Number(x.avg) : 0;
  const el = h("div", {class:"sheet hl", role:"dialog", "aria-modal":"true", "aria-label":"Статистика " + nick},
    h("div", {class:"grab"}),
    h("div", {class:"sh-top"}, h("span", {class:"warning-caption"}, "Статистика помощника"), h("button", {type:"button", class:"ib sq", "aria-label":"Закрыть", onclick:closeSheet}, "✕")),
    h("div", {class:"hhead"}, h("div", {class:"av hav"}, initial(nick)), h("div", {class:"hnm"}, h("h2", {}, nick), h("span", {class:"badge"}, ROLE[x.role] || "Помощник"))),
    h("div", {class:"hrate"}, avg ? [stars(avg), h("b", {}, " " + avg), h("span", {class:"meta"}, ` · отзывов: ${x.reviews}`)] : h("span", {class:"meta"}, "Пока нет отзывов")),
    h("div", {class:"stats hs"}, tile("Выполнено", x.done || 0), tile("Оценка", avg || "—"), tile("Отзывов", x.reviews || 0)),
    ext,
    h("button", {type:"button", class:"go", onclick:() => { closeSheet(); go("home"); }}, "Оставить заявку"));
  openSheet(el, () => { if (location.hash.startsWith("#team/")) { if (pushed) history.back(); else history.replaceState(null, "", "#team"); } });
  db.rpc("staff_profile", {p_nick:nick}).then(({ data: d, error }) => {
    if (!el.isConnected) return;
    if (error || !d) { ext.remove(); if (error) console.info("staff_profile недоступна — выполни helper-stats.sql в Supabase", error.message); return; }
    const parts = [h("h2", {}, "Закрытых заявок"), h("div", {class:"stats hs"}, tile("Сегодня", d.day || 0), tile("Неделя", d.week || 0), tile("Месяц", d.month || 0))];
    const dist = d.dist || {}, total = [1, 2, 3, 4, 5].reduce((a, k) => a + (Number(dist[k]) || 0), 0);
    if (total) {
      const bars = [5, 4, 3, 2, 1].map(k => { const c = Number(dist[k]) || 0, i = h("i"); requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = (c / total * 100) + "%"; })); return h("div", {class:"dr"}, h("span", {}, k + " ★"), h("div", {class:"bar"}, i), h("span", {class:"meta"}, String(c))); });
      parts.push(h("h2", {}, "Оценки"), h("div", {class:"dist"}, bars));
    }
    const rec = (d.recent || []).filter(r => r.comment);
    if (rec.length) parts.push(h("h2", {}, "Последние отзывы"), ...rec.map(r => h("div", {class:"rv"}, stars(r.stars), h("div", {}, r.comment), h("div", {class:"meta"}, ago(r.created_at) + " назад"))));
    ext.replaceChildren(...parts);
  });
}

/* ---------- вход ---------- */

function login(box) {
  const n = h("input", {
    autocomplete: "username",
    placeholder: "Ник"
  });
  const p = h("input", {
    type: "password",
    autocomplete: "current-password",
    placeholder: "Пароль"
  });
  const msg = h("div", {
    class: "msg err",
    role: "alert",
    "aria-live": "polite"
  });
  const btn = h("button", { class: "go" }, "Войти");

  const submit = async () => {
    if (btn.disabled) return;

    msg.textContent = "";
    btn.disabled = true;
    btn.textContent = "Входим…";

    try {
      const nk = n.value.trim().toLowerCase();

      if (!/^[a-z0-9_]{3,20}$/.test(nk)) {
        msg.textContent = "Неверный ник или пароль.";
        return;
      }

      const { error } = await db.auth.signInWithPassword({
        email: nk + "@dorsotic.app",
        password: p.value
      });

      if (error) {
        console.error("Login error:", error);
        msg.textContent = "Неверный ник или пароль.";
        return;
      }

      await loadMe();

      if (!me) {
        msg.textContent = "У этого аккаунта нет доступа.";
        return;
      }

      drawNav();
      await go("staff");
    } catch (e) {
      console.error("Sign-in error:", e);
      msg.textContent = e?.message
        ? "Ошибка входа: " + e.message
        : "Не удалось войти. Проверь подключение и попробуй ещё раз.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Войти";
    }
  };

  btn.onclick = submit;
  p.onkeydown = e => {
    if (e.key === "Enter") submit();
  };
  n.onkeydown = e => {
    if (e.key === "Enter") submit();
  };

  box.append(
    h("h1", {}, "Вход для персонала"),
    h("p", { class: "sub" },
      "Хочешь стать помощником? Напиши владельцу в Telegram."
    ),
    h("div", { class: "door" },
      fld("Ник", n),
      fld("Пароль", p),
      btn,
      msg
    )
  );
}


/* ---------- панель ---------- */
async function staffView(box) {
  const T = [["requests", "Заявки", tabRequests], ["profile", "Профиль", tabProfile]];
  if (me.role === "owner") T.push(["ach", "Ачивки", tabAch]);
  if (me.role !== "moderator") T.push(["manage", "Управление", tabManage]);
  if (!T.some(t => t[0] === tab)) tab = "requests";
  const pane = h("div");
  const draw = async () => { clearInterval(timer); const p = h("div"); pane.replaceChildren(p); await T.find(t => t[0] === tab)[2](p); };
  const tabs = h("div", {class:"tabs"}, T.map(([k, l]) => h("button", {class:k === tab ? "on" : "", onclick:e => { tab = k; [...tabs.children].forEach(b => b.classList.remove("on")); e.currentTarget.classList.add("on"); draw(); }}, l)));
  box.append(tabs, pane); await draw();
}
async function tabRequests(box) {
  let data = [], notes = {}, closedN = 0, q = "", first = true;
  const list = h("div", {class:"grid"}), chips = h("div", {class:"tabs"});
  const sq = h("input", {placeholder:"Поиск: ник, достижение, юзернейм…", "aria-label":"Поиск", oninput:e => { q = e.target.value.trim().toLowerCase(); fill(); }});
  const btns = Object.keys(ST).map(k => { const b = h("button", {class:k === rf ? "on" : "", onclick:() => { rf = k; btns.forEach(x => x.classList.toggle("on", x === b)); fill(); }}); b.dataset.k = k; return b; });
  chips.append(...btns, h("button", {class:"ghost", title:"Обновить", style:"margin-left:auto", onclick:() => load(true)}, "⟳"));
  const act = async (fn, args, okMsg) => { const { error } = await db.rpc(fn, args); if (error) return toast(error.message, 1); if (okMsg) toast(okMsg); load(true); };
  const card = r => {
    const id = String(r.id), can = r.taken_by === me.id || me.role !== "moderator";
    const left = r.status === "waiting" ? Math.round((new Date(r.held_at || r.created_at).getTime() + 3 * 864e5 - Date.now()) / 36e5) : null;
    const c = h("div", {class:"card " + r.status},
      h("b", {}, r.achievement.split("; ").join(" · ")), h("div", {}, `${r.nickname} · ${PL[r.platform]} ${r.username}`),
      r.reward ? h("div", {class:"gift"}, "Награда: " + r.reward) : null, r.note ? h("div", {}, r.note) : null,
      r.hold_note ? h("div", {class:"meta"}, "Ожидание: " + r.hold_note) : null,
      left !== null ? h("div", {class:"meta warn"}, left <= 0 ? "Скоро будет удалена автоматически" : `Автоудаление через ${left < 48 ? left + " ч" : Math.ceil(left / 24) + " дн"}`) : null,
      ...(notes[id] || []).map(n => h("div", {class:"note"}, `✎ ${profiles[n.staff_id]?.nickname || "?"}: ${n.text}`)),
      h("div", {class:"meta"}, h("span", {class:"pill " + r.status}, ST[r.status]), `${r.taken_by && profiles[r.taken_by] ? " " + profiles[r.taken_by].nickname + " ·" : ""} ${fmt(r.created_at)} · ${ago(r.created_at)} назад`));
    const a = h("div", {class:"acts"});
    if (r.status === "new") a.append(h("button", {onclick:() => act("start_request", {p_id:id})}, "Начать работу"));
    if (r.status === "in_progress" && can) a.append(h("button", {onclick:() => act("close_request", {p_id:id})}, "Закрыть"), h("button", {class:"hold", onclick:async () => {
      const t = await modal({title:"В ожидание", input:{max:120, ph:"Причина или до когда ждём (по желанию)"}, ok:"В ожидание"});
      if (t !== null) act("hold_request", {p_id:id, p_note:t || null}, "Заявка переведена в ожидание.");
    }}, "В ожидание"));
    if (r.status === "waiting" && can) a.append(h("button", {onclick:() => act("resume_request", {p_id:id}, "Заявка снова в работе.")}, "Вернуть в работу"), h("button", {class:"ghost", onclick:() => act("close_request", {p_id:id})}, "Закрыть"));
    if ((r.status === "in_progress" || r.status === "waiting") && can) a.append(h("button", {class:"ghost", onclick:async () => {
      const sel = h("select", {}, h("option", {value:""}, "В общую очередь"), Object.values(profiles).filter(p => p.id !== me.id).map(p => h("option", {value:p.id}, `${p.nickname} (${ROLE[p.role]})`)));
      const to = await modal({title:"Передать заявку", body:sel, ok:"Передать"});
      if (to !== null) act("transfer_request", {p_id:id, p_to:to || null}, "Заявка передана.");
    }}, "Передать"));
    a.append(h("button", {class:"ghost", onclick:() => copy(r.username, "Контакт скопирован: " + r.username)}, "Контакт"),
      h("button", {class:"ghost", onclick:async () => {
        const t = await modal({title:"Заметка для персонала", input:{max:300, ph:"Видна только сотрудникам"}, ok:"Сохранить"});
        if (!t) return;
        const { error } = await db.rpc("add_note", {p_id:id, p_text:t}); if (error) return toast(error.message, 1); load(true);
      }}, "Заметка"));
    if (me.role !== "moderator") a.append(h("button", {class:"ghost", onclick:async () => {
      if (await modal({title:"В чёрный список?", text:`Ник ${r.nickname} и юзернейм ${r.username} больше не смогут отправлять заявки.`, ok:"Добавить"}) === null) return;
      const { error } = await db.rpc("add_blacklist", {p_id:id}); toast(error ? error.message : "Добавлено в чёрный список.", !!error);
    }}, "В ЧС"));
    a.append(h("button", {class:"bad", onclick:async () => { if (await modal({title:"Удалить заявку?", ok:"Удалить"}) !== null) act("delete_request", {p_id:id}); }}, "Удалить"));
    c.append(a); return c;
  };
  const fill = () => {
    btns.forEach(b => { const k = b.dataset.k; b.textContent = `${ST[k]} (${k === "closed" ? closedN : data.filter(r => r.status === k).length})`; });
    const rows = data.filter(r => r.status === rf && (!q || `${r.nickname} ${r.achievement} ${r.username}`.toLowerCase().includes(q))).sort((a, b) => !!b.reward - !!a.reward);
    list.replaceChildren(...(rows.length ? rows.map(card) : [h("p", {class:"empty"}, "Здесь пока пусто.")]));
  };
  const load = async manual => {
    if (!manual && document.querySelector(".bd")) return;
    const sel = "id,nickname,achievement,reward,platform,username,note,status,taken_by,held_at,hold_note,created_at";
    const [a, b, n, c] = await Promise.all([
      db.from("requests").select(sel).neq("status", "closed").order("created_at", {ascending:false}).limit(500),
      db.from("requests").select(sel).eq("status", "closed").order("created_at", {ascending:false}).limit(50),
      db.from("request_notes").select("request_id,staff_id,text").order("created_at").limit(1000),
      db.from("requests").select("id", {count:"exact", head:true}).eq("status", "closed")]);
    if (a.error || b.error) { if (manual) toast("Не удалось загрузить заявки.", 1); return; }
    data = [...a.data, ...b.data]; closedN = c.count ?? b.data.length; notes = {};
    (n.data || []).forEach(x => (notes[x.request_id] ||= []).push(x));
    const cnt = a.data.filter(r => r.status === "new").length;
    if (lastNew !== null && cnt > lastNew) toast("Новая заявка!");
    lastNew = cnt; document.title = (cnt ? `(${cnt}) ` : "") + TITLE; fill();
  };
  box.append(chips, h("div", {}, sq), list); await load(true);
  timer = setInterval(() => load(), 15000);
}
async function tabProfile(box) {
  let uid = me.id; const out = h("div");
  const draw = async () => {
    const [{ data: s, error }, { data: rv }] = await Promise.all([db.rpc("staff_stats", {p_uid:uid}), db.from("reviews").select("id,stars,comment,created_at").eq("staff_id", uid).order("created_at", {ascending:false}).limit(10)]);
    if (error || !s) { out.replaceChildren(h("p", {class:"empty"}, "Нет данных.")); return; }
    const n = (l, v) => h("div", {class:"stat"}, h("span", {}, String(v)), l);
    out.replaceChildren(h("h2", {}, "Закрытых заявок"), h("div", {class:"stats"}, n("Сегодня", s.day), n("Неделя", s.week), n("Месяц", s.month), n("Всё время", s.total)),
      h("h2", {}, "Отзывы"), s.avg ? h("div", {}, stars(s.avg), ` ${s.avg} из 5 · всего: ${s.reviews}`) : h("p", {class:"empty"}, "Отзывов пока нет."),
      ...(rv || []).map(r => h("div", {class:"card closed"}, stars(r.stars), r.comment ? h("div", {}, r.comment) : null, h("div", {class:"meta"}, fmt(r.created_at)),
        me.role === "owner" ? h("div", {class:"acts"}, h("button", {class:"ghost", onclick:async () => {
          if (await modal({title:"Удалить отзыв?", ok:"Удалить"}) === null) return;
          const { error: e } = await db.from("reviews").delete().eq("id", r.id); if (e) return toast("Не удалось удалить отзыв.", 1); toast("Отзыв удалён."); draw(); drawFoot();
        }}, "Удалить отзыв")) : null)));
  };
  if (me.role === "owner") { const sel = h("select", {onchange:e => { uid = e.target.value; draw(); }}, Object.values(profiles).map(p => h("option", {value:p.id}, `${p.nickname} · ${ROLE[p.role]}`))); sel.value = me.id; box.append(fld("Сотрудник", sel)); }
  const pw = h("input", {type:"password", placeholder:"Новый пароль, от 10 символов", autocomplete:"new-password"});
  const pwBtn = h("button", {class:"ghost", onclick:async () => {
    if (pw.value.length < 10) return toast("Пароль: минимум 10 символов.", 1);
    pwBtn.disabled = true; const { error } = await db.auth.updateUser({password:pw.value}); pwBtn.disabled = false;
    if (error) return toast("Не удалось сменить пароль.", 1); pw.value = ""; toast("Пароль изменён.");
  }}, "Сменить пароль");
  box.append(out, h("h2", {}, "Аккаунт"), fld("Новый пароль", pw), h("div", {class:"acts"}, pwBtn, h("button", {class:"ghost", onclick:async () => { await db.auth.signOut(); me = null; drawNav(); go("home"); }}, `Выйти (${me.nickname} · ${ROLE[me.role]})`)));
  await draw();
}
async function tabAch(box) {
  const ta = h("textarea", {placeholder:"По одному достижению в строке", style:"min-height:140px"}), list = h("div");
  const load = async () => {
    const { data } = await db.from("achievements").select("*").order("name");
    list.replaceChildren(h("h2", {}, `Список достижений (${data?.length || 0})`), ...(data || []).map(a => h("div", {class:"card closed", style:"display:flex;justify-content:space-between;align-items:center"}, a.name,
      h("button", {class:"ghost", "aria-label":"Удалить " + a.name, onclick:async () => { await db.from("achievements").delete().eq("id", a.id); load(); }}, "×"))));
  };
  box.append(h("div", {class:"door"}, fld("Добавить достижения", ta), h("button", {class:"go", onclick:async () => {
    const rows = [...new Set(ta.value.split("\n").map(s => s.trim().slice(0, 80)).filter(Boolean))].map(name => ({name}));
    if (!rows.length) return;
    const { error } = await db.from("achievements").upsert(rows, {onConflict:"name", ignoreDuplicates:true});
    if (error) { console.error(error); return toast("Не удалось добавить: " + (error.message || error.code), 1); } ta.value = ""; toast("Добавлено."); load();
  }}, "Добавить")), list);
  load();
}
async function tabManage(box) {
  const S = [["complaints", "Жалобы", subComplaints], ["bl", "Чёрный список", subBlacklist]];
  if (me.role === "owner") S.unshift(["team", "Команда", subTeam], ["log", "Журнал", subLog]);
  if (!S.some(x => x[0] === msub)) msub = S[0][0];
  const pane = h("div"), seg = h("div", {class:"tabs"});
  const draw = async () => { const p = h("div"); pane.replaceChildren(p); await S.find(x => x[0] === msub)[2](p); };
  S.forEach(([k, l]) => seg.append(h("button", {class:k === msub ? "on" : "", onclick:e => { msub = k; [...seg.children].forEach(b => b.classList.remove("on")); e.currentTarget.classList.add("on"); draw(); }}, l)));
  box.append(seg, pane); await draw();
}
async function subTeam(box) {
  const n = h("input", {placeholder:"ник: a-z, 0-9, _", maxlength:20}), p = h("input", {placeholder:"пароль от 10 символов", type:"password", autocomplete:"new-password"});
  const r = h("select", {}, h("option", {value:"moderator"}, "Модератор"), h("option", {value:"admin"}, "Админ")), msg = h("div", {class:"msg"});
  const b = h("button", {class:"go", onclick:async () => {
    b.disabled = true; msg.className = "msg err"; msg.textContent = "";
    const { error } = await db.functions.invoke("create-staff", {body:{nickname:n.value.trim().toLowerCase(), password:p.value, role:r.value}});
    b.disabled = false;
    if (error) { let t = "Не удалось создать аккаунт."; try { t = (await error.context.json()).error || t; } catch {} msg.textContent = t; return; }
    toast("Аккаунт создан. Передай ник и пароль сотруднику."); await loadMe(); go("staff");
  }}, "Создать аккаунт");
  box.append(h("div", {class:"door"}, fld("Ник", n), fld("Пароль", p), fld("Роль", r), b, msg), h("h2", {}, "Команда"),
    ...Object.values(profiles).map(x => h("div", {class:"card closed"}, h("b", {}, x.nickname), h("div", {class:"meta"}, ROLE[x.role]))));
}
async function subLog(box) {
  const { data } = await db.from("action_log").select("*").order("created_at", {ascending:false}).limit(200);
  const L = {start:"начал(а) работу", close:"закрыл(а)", delete:"удалил(а)", cancel:"отозвал(а) заявку", transfer:"передал(а) заявку", hold:"перевёл(а) в ожидание", resume:"вернул(а) в работу"};
  box.append(...(data?.length ? data.map(x => h("div", {class:"card"}, h("b", {}, `${x.action === "cancel" ? "Посетитель" : profiles[x.staff_id]?.nickname || "удалённый аккаунт"} ${L[x.action] || x.action}`), h("div", {}, x.summary), h("div", {class:"meta"}, fmt(x.created_at)))) : [h("p", {class:"empty"}, "Журнал пуст.")]));
}
async function subComplaints(box) {
  const { data } = await db.from("complaints").select("*").order("created_at", {ascending:false}).limit(100);
  box.append(...(data?.length ? data.map(x => h("div", {class:"card waiting"}, h("b", {}, "На помощника: " + x.staff_name), h("div", {}, x.text), h("div", {class:"meta"}, fmt(x.created_at)),
    h("div", {class:"acts"}, h("button", {class:"ghost", onclick:async () => { await db.from("complaints").delete().eq("id", x.id); go("staff"); }}, "Решено")))) : [h("p", {class:"empty"}, "Жалоб нет.")]));
}
async function subBlacklist(box) {
  const v = h("input", {placeholder:"ник или @юзернейм", maxlength:40});
  const { data } = await db.from("blacklist").select("*").order("created_at", {ascending:false});
  box.append(h("div", {class:"door"}, fld("Добавить вручную", v), h("button", {class:"go", onclick:async () => {
    if (!v.value.trim()) return; const { error } = await db.from("blacklist").insert({value:v.value.trim()}); if (error) return toast("Не удалось добавить.", 1); go("staff");
  }}, "Добавить")), h("h2", {}, `В списке: ${data?.length || 0}`),
    ...(data || []).map(x => h("div", {class:"card", style:"display:flex;justify-content:space-between;align-items:center"}, x.value,
      h("button", {class:"ghost", "aria-label":"Убрать " + x.value, onclick:async () => { await db.from("blacklist").delete().eq("value", x.value); go("staff"); }}, "×"))));
}

/* ---------- запуск ---------- */
window.addEventListener("popstate", () => { const hs = location.hash.slice(1); if (hs === "team" && document.querySelector(".sheet-bd.hl, .sheet-bd.hs")) return closeSheet(); go(hs); });
db.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && me) { me = null; drawNav(); go("login"); } });
$("logo").onclick = () => go("home");
(async () => {
  const m = location.hash.match(/^#t=([0-9a-f-]{36})$/i);
  if (m) { if (!toks().includes(m[1])) saveToks([...toks(), m[1]]); history.replaceState(null, "", location.pathname); }
  try { await loadMe(); } catch (e) { console.error(e); me = null; }
  drawNav(); drawFoot().catch(() => {});
  const r0 = location.hash.slice(1);
  await go(ROUTES.includes(r0.split("/")[0]) ? r0 : me ? "staff" : "home");
})();

/* ---------- глазок у полей пароля (в том числе на форуме) ---------- */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const icon = off => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "20"); s.setAttribute("height", "20");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    const p = document.createElementNS(NS, "path"); p.setAttribute("d", "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z");
    const c = document.createElementNS(NS, "circle"); c.setAttribute("cx", "12"); c.setAttribute("cy", "12"); c.setAttribute("r", "3");
    s.append(p, c);
    if (off) { const l = document.createElementNS(NS, "path"); l.setAttribute("d", "M3 3l18 18"); s.append(l); }
    return s;
  };
  const wrap = inp => {
    if (inp.dataset.eye || inp.type !== "password" || !inp.parentNode) return;
    inp.dataset.eye = "1";
    const box = document.createElement("span"), btn = document.createElement("button");
    box.className = "pw"; btn.type = "button"; btn.className = "eye";
    const set = shown => { btn.replaceChildren(icon(shown)); btn.setAttribute("aria-label", shown ? "Скрыть пароль" : "Показать пароль"); btn.setAttribute("aria-pressed", String(shown)); };
    set(false);
    btn.addEventListener("click", () => {
      const show = inp.type === "password", s = inp.selectionStart, e = inp.selectionEnd;
      inp.type = show ? "text" : "password"; set(show); inp.focus();
      try { inp.setSelectionRange(s, e); } catch (_) {}
    });
    inp.parentNode.insertBefore(box, inp); box.append(inp, btn);
  };
  const scan = root => root.querySelectorAll && root.querySelectorAll('input[type="password"]').forEach(wrap);
  scan(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches('input[type="password"]')) wrap(n); scan(n); } }))).observe(document.body, {childList:true, subtree:true});
})();

/* ---------- эффекты: волна при нажатии, каскадное появление ---------- */
(function () {
  const NO = "#nav button,.ib,.eye,.stbtn,.lk2,.avbtn,.avedit,.bnedit,.bnrm,.pick button,.tag button,.x,.cam";
  document.addEventListener("pointerdown", e => {
    if (reduceMotion() || e.button > 0) return;
    const b = e.target.closest && e.target.closest("button"); if (!b || b.disabled || b.matches(NO)) return;
    const pos = getComputedStyle(b).position; if (pos === "absolute" || pos === "fixed") return;
    if (pos === "static") b.style.position = "relative";
    b.classList.add("rp");
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, w = h("span", {class:"rpl", "aria-hidden":"true"});
    w.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.append(w); setTimeout(() => w.remove(), 650);
  }, {passive:true});
  const SEL = ".card,.stat,details,.tm,.fs,.mrow,.door,.rv,.dr";
  const idx = el => { let i = 0, n = el; while ((n = n.previousElementSibling)) i++; return Math.min(i, 12); };
  const mark = el => {
    if (el.nodeType !== 1) return;
    const set = n => { if (!n.style.getPropertyValue("--i")) n.style.setProperty("--i", idx(n)); };
    if (el.matches(SEL)) set(el); el.querySelectorAll(SEL).forEach(set);
  };
  const ob = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(mark)));
  ob.observe($("app"), {childList:true, subtree:true}); ob.observe(document.body, {childList:true});
})();
