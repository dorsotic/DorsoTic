"use strict";
const SB_URL = "https://swdmjwgwripgpcnglhse.supabase.co";
const SB_KEY = "sb_publishable_hv4OhCNL1n8A5pbs526FpQ_hX7o6xmb";
const SITE_VERSION = "2.20-1b";
const TITLE = "Достижения DOORS: помощь с ачивками — DorsoTic";
const ROLE = {moderator:"Модератор", admin:"Админ", owner:"Владелец"};
const ST = {new:"Новая", in_progress:"Выполняется", waiting:"Ожидание", closed:"Закрыта"};
const PL = {discord:"Discord", telegram:"Telegram"};
let FPATH = "";
const ROUTES = ["home", "info", "team", "forum", "update", "staff", "login"];
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
function drawNav() {
  const nb = (v, ic, l) => h("button", {"data-v":v, onclick:() => go(v)}, h("span", {"aria-hidden":"true"}, ic), h("span", {}, l));
  $("nav").replaceChildren(nb("home", "✎", "Заявка"), nb("info", "?", "Инфо"), nb("team", "★", "Помощники"), nb("forum", "☰", "Форум"), nb("update", "◷", "Обновление"), ...(me ? [nb("staff", "☺", "Панель")] : []));
  $("fl").replaceChildren(...(me ? [] : [h("a", {href:"#login", class:"lk", onclick:e => { e.preventDefault(); go("login"); }}, "Вход для персонала")]));
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
  document.getElementById("fbar")?.remove(); document.querySelector(".sheet-bd")?.remove();
  const box = h("div");
  $("app").className = v === "staff" ? "wide" : "";
  $("app").replaceChildren(box);
  document.querySelectorAll("#nav button").forEach(b => { const on = b.dataset.v === v; b.classList.toggle("cur", on); on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"); });
  const hv = v === "forum" && FPATH ? "forum/" + FPATH : v; if (location.hash.slice(1) !== hv) history.pushState(null, "", "#" + hv);
  window.scrollTo(0, 0); clearInterval(timer); document.title = TITLE;
  try {
    if (v === "home") await home(box); else if (v === "login") login(box); else if (v === "info") how(box);
    else if (v === "team") await team(box); else if (v === "forum") await forum(box); else if (v === "update") updateView(box);
    else await staffView(box);
  } catch (e) { console.error(e); box.replaceChildren(h("h1", {}, "Ошибка"), h("p", {class:"sub"}, "Не удалось загрузить страницу. Обнови её.")); }
}


/* ---------- обновление: The Candy Vault ---------- */
const CV = {start:"2026-10-22T21:00:00+03:00", end:"2026-11-09T07:55:00+03:00"}; // время МСК (UTC+3)
function updateView(box) {
  const t0 = Date.parse(CV.start), t1 = Date.parse(CV.end);
  const nums = ["дней", "часов", "минут", "секунд"].map(l => { const n = h("span", {}, "00"); return {n, el:h("div", {class:"stat"}, n, l)}; });
  const cap = h("div", {class:"sub", style:"margin:.2rem 0 0"}), state = h("div", {class:"warning-caption", style:"margin-top:.9rem"});
  const when = d => new Date(d).toLocaleString("ru-RU", {dateStyle:"long", timeStyle:"short"});
  const tick = () => {
    const now = Date.now(); let left, st, c;
    if (now < t0) { left = t0 - now; st = "До начала обновления"; c = "Старт: " + when(t0); }
    else if (now < t1) { left = t1 - now; st = "Обновление уже идёт!"; c = "Событие закончится: " + when(t1); }
    else { left = 0; st = "Событие завершилось"; c = "Закончилось: " + when(t1); }
    const s = Math.floor(left / 1000), v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
    nums.forEach((x, i) => x.n.textContent = String(v[i]).padStart(2, "0"));
    state.textContent = st; cap.textContent = c;
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
      cap,
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

      if (!/^[a-z0-9
