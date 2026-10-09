"use strict";
const SB_URL = "https://swdmjwgwripgpcnglhse.supabase.co";
const SB_KEY = "sb_publishable_hv4OhCNL1n8A5pbs526FpQ_hX7o6xmb";
const TITLE = "Достижения DOORS: помощь с ачивками — DorsoTic";
const ROLE = {moderator:"Модератор", admin:"Админ", owner:"Владелец"};
const ST = {new:"Новая", in_progress:"Выполняется", waiting:"Ожидание", closed:"Закрыта"};
const PL = {discord:"Discord", telegram:"Telegram"};
const ROUTES = ["home", "info", "team", "forum", "staff", "login"];
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
  const t = h("div", {class:"toast" + (bad ? " bad" : ""), role:"status", "aria-live":"polite"}, text);
  document.body.append(t); setTimeout(() => t.remove(), 3500);
}
const copy = (t, ok) => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast(ok), () => toast("Не удалось скопировать.", 1));

/* Модальное окно. Возвращает null при отмене; true/строку при подтверждении */
function modal({title, text, input, body, ok = "Ок", no = "Отмена"}) {
  return new Promise(res => {
    const inp = input ? h("input", {maxlength:input.max || 300, placeholder:input.ph || "", "aria-label":title}) : null;
    const fin = v => { bd.remove(); document.removeEventListener("keydown", esc); res(v); };
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
  const { data: { user } } = await db.auth.getUser();
  me = null; if (!user) return;
  const { data } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) { await db.auth.signOut(); return; }
  me = data;
  const r = await db.from("profiles").select("id,nickname,role");
  profiles = Object.fromEntries((r.data || []).map(p => [p.id, p]));
}
function drawNav() {
  const nb = (v, ic, l) => h("button", {"data-v":v, onclick:() => go(v)}, h("span", {"aria-hidden":"true"}, ic), h("span", {}, l));
  $("nav").replaceChildren(nb("home", "✎", "Заявка"), nb("info", "?", "Инфо"), nb("team", "★", "Помощники"), nb("forum", "☰", "Форум"), ...(me ? [nb("staff", "☺", "Панель")] : []));
  $("fl").replaceChildren(...(me ? [] : [h("a", {href:"#login", class:"lk", onclick:e => { e.preventDefault(); go("login"); }}, "Вход для персонала")]));
}
async function drawFoot() {
  const { data } = await db.rpc("service_rating");
  const ok = !!data?.avg;
  $("rate").replaceChildren(stars(ok ? data.avg : 0), ok ? ` ${data.avg} (${data.count})` : " нет оценок");
  $("fr").replaceChildren(ok ? h("div", {}, stars(data.avg), ` ${data.avg} из 5 · отзывов: ${data.count}`) : "Пока нет отзывов");
}
async function go(v) {
  if (!ROUTES.includes(v)) v = "home";
  if (v === "staff" && !me) v = "login";
  const box = h("div");
  $("app").className = v === "staff" ? "wide" : "";
  $("app").replaceChildren(box);
  document.querySelectorAll("#nav button").forEach(b => { const on = b.dataset.v === v; b.classList.toggle("cur", on); on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"); });
  if (location.hash.slice(1) !== v) history.pushState(null, "", "#" + v);
  window.scrollTo(0, 0); clearInterval(timer); document.title = TITLE;
  try {
    if (v === "home") await home(box); else if (v === "login") login(box); else if (v === "info") how(box);
    else if (v === "team") await team(box); else if (v === "forum") box.append(h("h1", {}, "Форум"), h("p", {class:"sub"}, "Скоро будет"));
    else await staffView(box);
  } catch (e) { console.error(e); box.replaceChildren(h("h1", {}, "Ошибка"), h("p", {class:"sub"}, "Не удалось загрузить страницу. Обнови её.")); }
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
  const ps = h("div", {class:"stats"});
  db.rpc("public_stats").then(({ data: d }) => {
    if (!d) return;
    const n = (l, v) => h("div", {class:"stat"}, h("span", {}, String(v)), l);
    ps.replaceChildren(n("Выполнено", d.closed), n("В работе", d.open), n("Помощников", d.staff), n(d.reviews ? `Оценка (${d.reviews})` : "Оценка", d.avg || "—"));
  });
  box.append(h("h1", {}, "DorsoTic"), h("p", {class:"sub"}, "Помощь с достижениями в DOORS. Оставь заявку, и с тобой свяжется помощник."), ps,
    h("div", {class:"door"}, fld("Ник в Roblox", nick), h("div", {class:"lbl"}, "Какие достижения нужны (до 5)", pk.el),
      fld("Награда за помощь (по желанию, только внутриигровая). С наградой заявку берут быстрее", reward),
      h("div", {class:"row"}, fld("Где связаться", plat), fld("Юзернейм", un)),
      fld("Комментарий (по желанию)", note), site, btn, msg,
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
async function drawMine(box) {
  const all = toks();
  const res = await Promise.all(all.map(t => db.rpc("request_status", {p_token:t}).then(r => [t, r])));
  const alive = res.filter(([, r]) => r.error || r.data?.[0]).map(([t]) => t);
  if (alive.length < all.length) { saveToks(alive); toast("Часть заявок удалена или истекла и убрана из списка."); }
  const items = [];
  for (const [t, r] of res) {
    const s = r.data?.[0]; if (!s) continue;
    const c = h("div", {class:"card " + s.status}, h("b", {}, s.achievement.split("; ").join(" · ")),
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
    ...S.map(([t, d], i) => h("div", {class:"card"}, h("b", {}, `${i + 1}. ${t}`), h("div", {class:"meta"}, d))),
    h("h2", {}, "Частые вопросы"), ...F.map(([q, a]) => h("details", {}, h("summary", {}, q), h("p", {}, a))));
}
async function team(box) {
  box.append(h("h1", {}, "Помощники"), h("p", {class:"sub"}, "Рейтинг и число выполненных заявок"));
  const { data } = await db.rpc("staff_public");
  box.append(...((data || []).length ? data.map(x => h("div", {class:"card closed"}, h("b", {}, x.nickname), h("div", {class:"meta"}, `${ROLE[x.role] || ""} · выполнено: ${x.done}`),
    x.avg ? h("div", {}, stars(x.avg), ` ${x.avg} (${x.reviews})`) : h("div", {class:"meta"}, "Пока нет отзывов"))) : [h("p", {class:"empty"}, "Пока никого.")]));
}

/* ---------- вход ---------- */
function login(box) {
  const n = h("input", {autocomplete:"username"}), p = h("input", {type:"password", autocomplete:"current-password"}), msg = h("div", {class:"msg err"});
  const submit = async () => {
    msg.textContent = "";
    const nk = n.value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(nk)) { msg.textContent = "Неверный ник или пароль."; return; }
    const { error } = await db.auth.signInWithPassword({email:nk + "@dorsotic.app", password:p.value});
    if (error) { msg.textContent = "Неверный ник или пароль."; return; }
    await loadMe();
    if (!me) { msg.textContent = "У этого аккаунта нет доступа."; return; }
    drawNav(); go("staff");
  };
  p.onkeydown = e => { if (e.key === "Enter") submit(); };
  box.append(h("h1", {}, "Вход для персонала"), h("p", {class:"sub"}, "Хочешь стать помощником? Напиши владельцу в Telegram."), h("div", {class:"door"}, fld("Ник", n), fld("Пароль", p), h("button", {class:"go", onclick:submit}, "Войти"), msg));
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
    if (error) return toast("Не удалось добавить.", 1); ta.value = ""; toast("Добавлено."); load();
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
window.addEventListener("popstate", () => go(location.hash.slice(1)));
db.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && me) { me = null; drawNav(); go("login"); } });
$("logo").onclick = () => go("home");
(async () => {
  const m = location.hash.match(/^#t=([0-9a-f-]{36})$/i);
  if (m) { if (!toks().includes(m[1])) saveToks([...toks(), m[1]]); history.replaceState(null, "", location.pathname); }
  try { await loadMe(); } catch (e) { console.error(e); me = null; }
  drawNav(); drawFoot().catch(() => {});
  const r0 = location.hash.slice(1);
  await go(ROUTES.includes(r0) ? r0 : me ? "staff" : "home");
})();
