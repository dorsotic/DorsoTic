"use strict";
/* Маркет DorsoTic (этап 1). Подключается после app.js и forum.js.
   Использует: db, h, fld, toast, modal, ago, fmt, me, go, FPATH, TITLE, $ (app.js)
   и fu, authCard, avatar, nameOf, fe (forum.js): вход общий с форумом.
   Весь пользовательский текст выводится только как текст (без innerHTML).
   Запись в БД идёт только через RPC (market.sql), права проверяет RLS/сервер. */
const LST = {active:"Активен", pending:"Ожидает обмена", done:"Завершён", cancelled:"Отменён", removed:"Скрыт модерацией"};
const DST = {setup:"Согласование", active:"Идёт обмен", done:"Завершена", cancelled:"Отменена", disputed:"Спор"};
const OST = {pending:"Ожидает ответа", accepted:"Принято", declined:"Отклонено", withdrawn:"Отозвано"};
const KIND = {trade:"Трейд", sale:"Продажа за R$"};
const UID = /^[0-9a-f-]{36}$/i, PRF = "id,username,display_name,avatar_path";
const LSEL = `id,author_id,kind,give,want,give_items,want_items,price_robux,ingame_nick,details,status,created_at,author:forum_profiles!market_listings_author_fkey(${PRF})`;
const mkf = {q:"", game:"", kind:"", status:"active", sort:"new"};
let mkUid, MKC = null;
const mkPrice = n => Number(n).toLocaleString("ru-RU") + " R$";
async function mkCatalog(force) {
  if (force || !MKC || Date.now() - MKC.t > 60000) {
    const { data } = await db.from("market_items").select("id,name,image_path,active").order("name");
    MKC = {t:Date.now(), list:data || [], map:Object.fromEntries((data || []).map(x => [x.id, x]))};
  }
  return MKC;
}
function mkImg(it) {
  const ph = () => h("span", {class:"mk-ph"}, (it?.name || "?")[0].toUpperCase());
  if (!it?.image_path || !/^[0-9a-f-]{36}\.jpg$/.test(it.image_path)) return ph();
  const i = h("img", {src:db.storage.from("market").getPublicUrl(it.image_path).data.publicUrl, alt:it.name, loading:"lazy"});
  i.onerror = () => i.replaceWith(ph()); return i;
}
/* ряд картинок вещей: [{id,n}] -> плитки; big показывает названия */
function mkThumbs(items, max, big) {
  const map = MKC?.map || {}, rows = (items || []).filter(x => map[x.id]);
  if (!rows.length) return null;
  return h("div", {class:"mk-items" + (big ? " big" : "")}, ...rows.slice(0, max).map(x => h("div", {class:"mk-it", title:map[x.id].name}, mkImg(map[x.id]), x.n > 1 ? h("i", {}, "×" + x.n) : null, big ? h("span", {}, map[x.id].name) : null)),
    rows.length > max ? h("div", {class:"mk-it more"}, "+" + (rows.length - max)) : null);
}
/* одна сторона обмена: подпись, картинки, текст/цена */
const mkSide = (label, items, text, price, big) => h("div", {}, h("small", {}, label), price ? null : mkThumbs(items, big ? 6 : 4, big), h("b", {class:price ? "mk-price" : ""}, price ? mkPrice(price) : text));

db.auth.onAuthStateChange((ev, s) => {
  const id = s?.user?.id || null;
  if (mkUid === undefined) { mkUid = id; return; }
  if (id === mkUid) return; mkUid = id;
  if (location.hash.startsWith("#market")) setTimeout(() => go(location.hash.slice(1) || "market"), 0);
});

const mkEmpty = t => h("p", {class:"empty", style:"padding:1.2rem .9rem"}, t);
const mkBadge = (t, c = "") => h("span", {class:"mk-tag " + c}, t);
const mkWho = p => h("a", {class:"mk-who", href:"#forum/u/" + (p?.username || ""), onclick:e => { e.preventDefault(); if (p?.username) go("forum/u/" + p.username); }}, nameOf(p), h("span", {class:"meta"}, " @" + (p?.username || "?")));
async function mkCall(name, args) {
  const { data, error } = await db.rpc(name, args || {});
  if (error) { toast(fe(error, "Не удалось. Попробуй позже."), 1); return null; }
  return { data };
}
async function mkComplain(type, target) {
  if (!fu) return go("market/auth");
  const v = await modal({title:"Пожаловаться", text:"Опиши, что не так. Жалобу рассмотрит администрация.", input:{max:300, ph:"Причина (от 5 символов)"}, ok:"Отправить"});
  if (v === null) return;
  if (v.length < 5) return toast("Опиши причину подробнее.", 1);
  if (await mkCall("market_complain", {p_type:type, p_target:String(target), p_reason:v})) toast("Жалоба отправлена.");
}
/* постраничный список: fetchPage(off) -> до 20 строк */
function mkPager(fetchPage, render, emptyT) {
  const list = h("div"), more = h("button", {class:"ghost", style:"margin:.9rem auto;display:block"}, "Показать ещё"); let off = 0, seq = 0;
  const next = async reset => {
    if (reset) { off = 0; list.replaceChildren(); }
    const my = ++seq; more.disabled = true; const rows = await fetchPage(off); if (my !== seq) return;
    rows.forEach((r, i) => { const e = render(r); e.style.setProperty("--i", Math.min(i, 8)); list.append(e); });
    if (!off && !rows.length) list.append(mkEmpty(emptyT));
    off += rows.length; more.disabled = false; more.style.display = rows.length < 20 ? "none" : "block";
  };
  more.onclick = () => next(); next(true);
  return {el:h("div", {}, list, more), reload:() => next(true)};
}

/* ---------- каркас раздела ---------- */
async function marketView(box) {
  const path = String(FPATH || ""), [k, a] = path.split("/");
  const { data:{ session } } = await db.auth.getSession(); fu = session?.user || null; if (mkUid === undefined) mkUid = fu?.id || null;
  document.title = "Маркет — " + TITLE;
  const C = {fu, mine:null, open:true, unread:0}; await mkCatalog();
  const [pr, st, un] = await Promise.all([
    fu ? db.from("forum_profiles").select("id,username,banned").eq("id", fu.id).maybeSingle() : null,
    db.from("market_settings").select("open").eq("id", 1).maybeSingle(),
    fu ? db.rpc("market_unread") : null]);
  C.mine = pr?.data || null; C.open = st?.data?.open !== false; C.unread = un?.data || 0;

  const cur = ["g", "d", "me", "admin"].includes(k) ? k : "";
  const tabs = h("div", {class:"tabs mk-tabs"}, ...[["", "Объявления"], ["g", "Гаранты"], ["d", "Мои сделки"], ["me", "Кабинет" + (C.unread ? ` (${C.unread})` : "")], ...(me ? [["admin", "Админ"]] : [])]
    .map(([p, l]) => h("button", {type:"button", class:cur === p ? "on" : "", onclick:() => go(p ? "market/" + p : "market")}, l)));
  box.append(h("h1", {}, "Маркет"), tabs);
  if (!C.open) box.append(h("p", {class:"msg err"}, "Маркет временно закрыт администрацией: просмотр доступен, действия отключены."));
  if (fu && !C.mine) return box.append(h("div", {class:"door"}, h("p", {}, "Профиль форума не найден. Выйди и войди снова."), h("button", {onclick:() => db.auth.signOut()}, "Выйти")));
  if (C.mine?.banned) box.append(h("p", {class:"msg err"}, "Аккаунт заблокирован: действия в маркете недоступны."));

  const guest = ["new", "edit", "me", "d"].includes(k) && !fu;
  if (k === "auth" || guest) {
    if (fu) return setTimeout(() => go("market"), 0);
    return box.append(h("p", {class:"sub"}, "Гости могут просматривать объявления. Чтобы создавать трейды и предлагать обмены, войди: аккаунт общий с форумом."), authCard());
  }
  const body = h("div"); box.append(body);
  if (k === "new") return mkForm(body, C, null);
  if (k === "edit" && UID.test(a || "")) return mkEdit(body, C, a);
  if (k === "l" && UID.test(a || "")) return mkListing(body, C, a);
  if (k === "g") return mkGuarantors(body, C);
  if (k === "d") return UID.test(a || "") ? mkDeal(body, C, a) : mkDeals(body, C);
  if (k === "me") return mkCabinet(body, C, a || "my");
  if (k === "admin" && me) return mkAdmin(body, C, a || "complaints");
  return mkFeed(body, C);
}

/* ---------- 1. главная: лента ---------- */
function mkCard(l) {
  const open = () => go("market/l/" + l.id);
  return h("div", {class:"card mk-card " + l.status, tabindex:"0", role:"link", onclick:open, onkeydown:e => { if (e.key === "Enter") open(); }},
    h("div", {class:"mk-tags"}, mkBadge(KIND[l.kind] || "", "kind"), mkBadge(LST[l.status] || l.status, "st-" + l.status)),
    h("div", {class:"mk-ex"}, mkSide("Отдаёт", l.give_items, l.give), h("span", {class:"mk-arr", "aria-hidden":"true"}, l.kind === "sale" ? "→" : "⇄"), mkSide(l.kind === "sale" ? "Цена" : "Хочет", l.want_items, l.want, l.kind === "sale" ? l.price_robux : null)),
    h("div", {class:"meta"}, "@" + (l.author?.username || "?") + " · " + ago(l.created_at) + " назад"));
}
async function mkFeed(box, C) {
  const f = mkf, cnt = h("p", {class:"sub", style:"margin:.1rem 0 .7rem"}, "Загрузка…"); let ids = null, pg;
  const q = h("input", {class:"srch", type:"search", placeholder:"Предмет, игра или ник", maxlength:40, value:f.q, "aria-label":"Поиск", autocomplete:"off"});
  const sel = (key, opts, label) => { const s = h("select", {"aria-label":label}, ...opts.map(([v, t]) => h("option", {value:v}, t))); s.value = f[key]; s.onchange = () => { f[key] = s.value; pg.reload(); }; return s; };
  const fetchPage = async off => {
    let qq = db.from("market_listings").select(LSEL).order("created_at", {ascending:f.sort === "old"}).range(off, off + 19);
    qq = f.status ? qq.eq("status", f.status) : qq.neq("status", "removed");
    if (f.kind) qq = qq.eq("kind", f.kind);
    const s = f.q.replace(/[^\p{L}\p{N}_ ]/gu, "").trim().slice(0, 40);
    if (s.length >= 2) {
      if (!ids || ids.q !== s) { const { data } = await db.from("forum_profiles").select("id").ilike("username", `%${s}%`).limit(30); ids = {q:s, v:(data || []).map(x => x.id)}; }
      qq = qq.or(`give.ilike.%${s}%,want.ilike.%${s}%,ingame_nick.ilike.%${s}%` + (ids.v.length ? `,author_id.in.(${ids.v.join(",")})` : ""));
    }
    const { data, error } = await qq; if (error) { toast("Не удалось загрузить.", 1); return []; } return data || [];
  };
  let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value; pg.reload(); }, 350); };
  const create = h("button", {class:"fbtn", type:"button", onclick:() => C.fu ? go("market/new") : go("market/auth")}, "Создать трейд");
  box.append(h("div", {class:"mk-top"}, cnt, create), h("div", {class:"sbox", style:"padding:.2rem 0"}, q),
    h("div", {class:"mk-filters mk-scroll"}, sel("kind", [["", "Любой тип"], ...Object.entries(KIND)], "Тип"),
      sel("status", [["active", "Активные"], ["pending", "Ожидают обмена"], ["done", "Завершённые"], ["cancelled", "Отменённые"], ["", "Все"]], "Статус"),
      sel("sort", [["new", "Сначала новые"], ["old", "Сначала старые"]], "Сортировка")));
  await mkCatalog(); pg = mkPager(fetchPage, mkCard, "Объявлений не найдено."); box.append(pg.el);
  const { count } = await db.from("market_listings").select("id", {count:"exact", head:true}).eq("status", "active");
  cnt.textContent = "Активных объявлений: " + (count ?? 0);
}

/* ---------- 2. создание / редактирование ---------- */
async function mkEdit(box, C, id) {
  const { data:l } = await db.from("market_listings").select("*").eq("id", id).maybeSingle();
  if (!l || l.author_id !== C.fu.id) return box.append(mkEmpty("Объявление не найдено."));
  if (l.status !== "active") return box.append(mkEmpty("Редактировать можно только активное объявление."));
  mkForm(box, C, l);
}
async function mkUpload(file) {
  const blob = await cropImg(file, 512, 512, .85), path = crypto.randomUUID() + ".jpg";
  const { error } = await db.storage.from("market").upload(path, blob, {contentType:"image/jpeg"});
  if (error) throw bad("Не удалось загрузить фото."); return path;
}
function mkForm(box, C, l) {
  const msg = h("div", {class:"msg err", role:"alert"});
  const st = {kind:l?.kind || "trade", give:(l?.give_items || []).map(x => ({...x})), want:(l?.want_items || []).map(x => ({...x}))};
  const price = h("input", {type:"text", inputmode:"numeric", maxlength:8, placeholder:"Например: 500", autocomplete:"off", "aria-label":"Цена в робуксах"}); price.value = l?.price_robux || "";
  const nick = h("input", {maxlength:40, placeholder:"Ник Roblox", autocomplete:"off"}); nick.value = l?.ingame_nick || "";
  const det = h("textarea", {maxlength:500, placeholder:"Когда онлайн, на какой сервер, что ещё важно"}); det.value = l?.details || "";
  const giveBox = h("div"), wantBox = h("div"), priceBox = h("div", {class:"mk-fld"}, h("small", {}, "Цена в робуксах (R$)"), price), wantWrap = h("div", {class:"mk-fld"}, h("small", {}, "Что хочешь получить"), wantBox);
  const draw = (key, el) => el.replaceChildren(...st[key].map((x, n) => { const it = MKC.map[x.id];
    return h("div", {class:"mk-sel"}, mkImg(it), h("b", {}, it?.name || "Вещь недоступна"),
      h("div", {class:"mk-cnt"}, h("button", {type:"button", class:"ghost", "aria-label":"Меньше", onclick:() => { if (x.n > 1) { x.n--; draw(key, el); } }}, "−"), h("span", {}, x.n),
        h("button", {type:"button", class:"ghost", "aria-label":"Больше", onclick:() => { if (x.n < 99) { x.n++; draw(key, el); } }}, "+")),
      h("button", {type:"button", class:"ib sq", "aria-label":"Убрать", onclick:() => { st[key].splice(n, 1); draw(key, el); }}, "✕")); }),
    h("button", {type:"button", class:"ghost mk-add", onclick:() => pick(key, el)}, "+ Добавить вещь"));
  const pick = async (key, el) => {
    const avail = MKC.list.filter(x => x.active);
    if (!avail.length) return toast("Каталог вещей пока пуст: вещи добавляет администрация.", 1);
    const grid = h("div", {class:"mk-grid"}), q = h("input", {class:"srch", type:"search", placeholder:"Найти вещь", maxlength:40, autocomplete:"off"});
    const paint = () => { const w = q.value.trim().toLowerCase();
      grid.replaceChildren(...avail.filter(x => !w || x.name.toLowerCase().includes(w)).map(it => h("button", {type:"button", class:"mk-pick" + (st[key].some(y => y.id === it.id) ? " on" : ""), onclick:() => {
        const n = st[key].findIndex(y => y.id === it.id);
        if (n >= 0) st[key].splice(n, 1); else if (st[key].length >= 6) return toast("Не больше 6 вещей.", 1); else st[key].push({id:it.id, n:1});
        paint(); }}, mkImg(it), h("span", {}, it.name)))); };
    q.oninput = paint; paint();
    await modal({title:key === "give" ? "Что отдаёшь" : "Что хочешь получить", body:h("div", {}, q, grid), ok:"Готово", no:"Закрыть"});
    draw(key, el);
  };
  const note = h("p", {class:"meta"}), kinds = h("div", {class:"ftabs mk-kind"}), setKind = k => { st.kind = k; note.textContent = k === "trade" ? "Трейд проходит только через гаранта: после согласования условий вы вместе выберете гаранта. Не передавай предметы и данные аккаунта вне сделки." : "Продажа за робуксы проходит без гаранта: ты сам договариваешься с покупателем. Не передавай данные аккаунта."; kinds.replaceChildren(...Object.entries(KIND).map(([v, t]) => h("button", {type:"button", class:v === k ? "on" : "", onclick:() => setKind(v)}, t)));
    wantWrap.style.display = k === "trade" ? "" : "none"; priceBox.style.display = k === "sale" ? "" : "none"; };
  draw("give", giveBox); draw("want", wantBox); setKind(st.kind);
  const go_ = h("button", {class:"go", type:"button"}, l ? "Сохранить" : "Опубликовать");
  go_.onclick = async () => {
    msg.textContent = ""; const sale = st.kind === "sale", pr = parseInt(String(price.value).replace(/\D/g, ""), 10) || null;
    if (!st.give.length) { msg.textContent = "Выбери, что отдаёшь."; return; }
    if (!sale && !st.want.length) { msg.textContent = "Выбери, что хочешь получить."; return; }
    if (sale && !(pr >= 1 && pr <= 10000000)) { msg.textContent = "Укажи цену от 1 до 10 000 000 R$."; return; }
    const v = {p_kind:st.kind, p_give:st.give, p_want:sale ? [] : st.want, p_price:sale ? pr : null, p_nick:nick.value.trim() || null, p_details:det.value.trim() || null};
    go_.disabled = true;
    const r = l ? await mkCall("market_edit_listing", {p_id:l.id, ...v}) : await mkCall("market_create_listing", v);
    go_.disabled = false; if (!r) return;
    toast(l ? "Сохранено." : "Объявление опубликовано."); go("market/l/" + (l ? l.id : r.data));
  };
  box.append(h("div", {class:"door"}, h("h2", {style:"margin-top:0"}, l ? "Редактирование" : "Новый трейд"), kinds,
    h("div", {class:"mk-fld"}, h("small", {}, "Что отдаёшь"), giveBox), wantWrap, priceBox,
    h("div", {class:"mk-fld"}, h("small", {}, "Ник в игре (необязательно)"), nick), h("div", {class:"mk-fld"}, h("small", {}, "Дополнительные условия"), det),
    note,
    go_, msg, h("button", {class:"ghost", type:"button", onclick:() => history.back(), style:"margin-top:.5rem"}, "Отмена")));
}

/* ---------- 3. страница трейда ---------- */
async function mkListing(box, C, id) {
  const { data:l } = await db.from("market_listings").select(LSEL).eq("id", id).maybeSingle();
  if (!l) return box.append(mkEmpty("Объявление не найдено или скрыто."));
  const mineL = !!C.fu && l.author_id === C.fu.id; let offers = [], myOffer = null, myDeal = null;
  if (C.fu) {
    if (mineL) offers = (await db.from("market_offers").select(`id,message,status,created_at,author:forum_profiles!market_offers_author_fkey(${PRF})`).eq("listing_id", id).order("created_at", {ascending:false})).data || [];
    else myOffer = (await db.from("market_offers").select("id,message,status").eq("listing_id", id).eq("author_id", C.fu.id).maybeSingle()).data;
    myDeal = (await db.from("market_deals").select("id,status").eq("listing_id", id).in("status", ["setup", "active", "disputed", "done"]).limit(1).maybeSingle()).data;
  }
  document.title = l.give + " ⇄ " + l.want + " — Маркет";
  const row = (k, v) => v ? h("div", {class:"mk-row"}, h("small", {}, k), h("span", {}, v)) : null;
  const acts = h("div", {class:"acts mk-acts"});
  const offer = async () => {
    if (!C.fu) return go("market/auth"); if (C.mine?.banned) return toast("Аккаунт заблокирован.", 1);
    const ta = h("textarea", {maxlength:300, placeholder:"Сообщение автору: что предлагаешь, когда онлайн"});
    const v = await modal({title:"Предложить трейд", body:ta, ok:"Отправить"}); if (v === null) return;
    if (await mkCall("market_make_offer", {p_listing:id, p_message:v.trim()})) { toast("Предложение отправлено."); go("market/l/" + id); }
  };
  const pickG = () => {
    if (!C.fu) return go("market/auth");
    if (myDeal) return go("market/d/" + myDeal.id);
    toast(mineL ? "Гаранта выбирают на странице сделки, после того как ты примешь предложение." : "Гаранта выбирают на странице сделки, после того как автор примет твоё предложение.");
    go("market/g");
  };
  if (l.status === "active" && !mineL) acts.append(myOffer?.status === "pending"
    ? h("button", {class:"ghost", onclick:async () => { if (await mkCall("market_withdraw_offer", {p_offer:myOffer.id})) { toast("Предложение отозвано."); go("market/l/" + id); } }}, "Отозвать предложение")
    : h("button", {class:"go", onclick:offer}, "Предложить трейд"));
  if (l.kind !== "sale") acts.append(h("button", {class:"ghost", onclick:pickG}, "Выбрать гаранта"));
  if (myDeal) acts.append(h("button", {class:"ghost", onclick:() => go("market/d/" + myDeal.id)}, "Открыть сделку"));
  if (mineL && l.status === "active") acts.append(h("button", {class:"ghost", onclick:() => go("market/edit/" + id)}, "Редактировать"));
  if (mineL && ["active", "pending", "cancelled"].includes(l.status)) acts.append(h("button", {class:"ghost bad", onclick:async () => {
    if (await modal({title:"Удалить объявление?", text:"Если по нему уже были сделки, оно будет отменено, а история сохранится.", ok:"Удалить"}) === null) return;
    if (await mkCall("market_delete_listing", {p_id:id})) { toast("Готово."); go("market"); } }}, "Удалить"));
  if (!mineL) acts.append(h("button", {class:"ghost", onclick:() => mkComplain("listing", id)}, "Пожаловаться"));
  if (me && !mineL && l.status !== "removed") acts.append(h("button", {class:"ghost bad", onclick:async () => {
    if (await modal({title:"Скрыть объявление?", text:"Автор получит уведомление.", ok:"Скрыть"}) === null) return;
    if (await mkCall("market_delete_listing", {p_id:id})) { toast("Скрыто."); go("market"); } }}, "Скрыть (модерация)"));

  box.append(h("button", {class:"ghost", style:"margin-bottom:.6rem", onclick:() => history.length > 1 ? history.back() : go("market")}, "← Назад"),
    h("div", {class:"door mk-page"}, h("div", {class:"mk-tags"}, mkBadge(KIND[l.kind] || "", "kind"), mkBadge(LST[l.status] || l.status, "st-" + l.status)),
      h("div", {class:"mk-ex big"}, mkSide("Отдаёт", l.give_items, l.give, null, true), h("span", {class:"mk-arr", "aria-hidden":"true"}, l.kind === "sale" ? "→" : "⇄"), mkSide(l.kind === "sale" ? "Цена" : "Хочет", l.want_items, l.want, l.kind === "sale" ? l.price_robux : null, true)),
      row("Ник в игре", l.ingame_nick), row("Способ", l.kind === "sale" ? "Без гаранта" : "Только через гаранта"),
      h("div", {class:"mk-row"}, h("small", {}, "Автор"), mkWho(l.author)), row("Опубликовано", fmt(l.created_at)),
      l.details ? h("div", {class:"mk-det"}, l.details) : null, acts));
  if (mineL) {
    box.append(h("h2", {class:"mk-h"}, "Предложения (" + offers.length + ")"));
    if (!offers.length) box.append(mkEmpty("Пока никто не предложил трейд."));
    offers.forEach(o => box.append(mkOfferCard(o, l.status === "active" && o.status === "pending", () => go("market/l/" + id))));
  }
}
function mkOfferCard(o, canAnswer, after, extra) {
  const c = h("div", {class:"card mk-offer"}, h("div", {class:"mk-tags"}, mkWho(o.author), mkBadge(OST[o.status] || o.status), h("span", {class:"meta"}, ago(o.created_at) + " назад")),
    extra || null, o.message ? h("div", {class:"mk-det"}, o.message) : h("div", {class:"meta"}, "Без сообщения"));
  if (canAnswer) c.append(h("div", {class:"acts"},
    h("button", {class:"ghost", onclick:async () => { if (await mkCall("market_answer_offer", {p_offer:o.id, p_accept:false})) { toast("Отклонено."); after(); } }}, "Отклонить"),
    h("button", {onclick:async () => { const r = await mkCall("market_answer_offer", {p_offer:o.id, p_accept:true}); if (r) { toast("Принято."); go("market/d/" + r.data); } }}, "Принять")));
  return c;
}

/* ---------- 4. гаранты ---------- */
async function mkGuarantors(box, C) {
  box.append(h("p", {class:"sub"}, "Гарант сопровождает обмен между двумя участниками. Статус выдаёт только администрация сайта. Гарант не может сам объявить сделку успешной: нужны подтверждения обеих сторон."));
  const { data, error } = await db.rpc("market_guarantor_list");
  if (error) return box.append(mkEmpty("Не удалось загрузить. Выполнен ли market.sql?"));
  if (!data?.length) return box.append(mkEmpty("Гарантов пока нет."));
  data.forEach(g => {
    const pr = {username:g.username, display_name:g.display_name, avatar_path:g.avatar_path};
    box.append(h("div", {class:"card mk-g"}, h("div", {class:"mk-gh"}, avatar(pr, "avlink"), h("div", {style:"min-width:0;flex:1"}, mkWho(pr), h("span", {class:"badge"}, "Гарант"))),
      g.bio ? h("div", {class:"mk-det"}, g.bio) : null,
      h("div", {class:"meta"}, `Проведено обменов: ${g.deals_done} · сделок всего: ${g.deals_total}`),
      h("div", {class:"acts"}, h("button", {class:"ghost", onclick:() => go("forum/u/" + g.username)}, "Профиль"), h("button", {class:"ghost", onclick:() => mkComplain("guarantor", g.user_id)}, "Пожаловаться"))));
  });
}

/* ---------- 5. сделки ---------- */
const DSEL = `id,listing_id,status,owner_id,partner_id,guarantor_id,ok_owner,ok_partner,ok_guarantor,done_owner,done_partner,dispute_reason,created_at,finished_at,
  listing:market_listings!market_deals_listing_fkey(id,kind,give,want,give_items,want_items,price_robux,ingame_nick,details),
  owner:forum_profiles!market_deals_owner_fkey(${PRF}),partner:forum_profiles!market_deals_partner_fkey(${PRF}),guarantor:forum_profiles!market_deals_guarantor_fkey(${PRF})`;
const mkDealCard = d => h("div", {class:"card mk-card", tabindex:"0", role:"link", onclick:() => go("market/d/" + d.id), onkeydown:e => { if (e.key === "Enter") go("market/d/" + d.id); }},
  h("div", {class:"mk-tags"}, mkBadge(KIND[d.listing?.kind] || "", "kind"), mkBadge(DST[d.status] || d.status, "st-d-" + d.status)),
  h("div", {class:"mk-ex"}, mkSide("Отдаёт", d.listing?.give_items, d.listing?.give || ""), h("span", {class:"mk-arr", "aria-hidden":"true"}, "⇄"), mkSide(d.listing?.kind === "sale" ? "Цена" : "Хочет", d.listing?.want_items, d.listing?.want || "", d.listing?.kind === "sale" ? d.listing.price_robux : null)),
  h("div", {class:"meta"}, `@${d.owner?.username} ⇄ @${d.partner?.username} · ${ago(d.created_at)} назад`));
function mkDeals(box, C) {
  const tab = {v:"cur"}, wrap = h("div"), tabs = h("div", {class:"ftabs", style:"margin:.2rem 0 .6rem"});
  const draw = () => {
    tabs.replaceChildren(...[["cur", "Активные"], ["end", "Завершённые"]].map(([v, l]) => h("button", {type:"button", class:tab.v === v ? "on" : "", onclick:() => { tab.v = v; draw(); }}, l)));
    const st = tab.v === "cur" ? ["setup", "active", "disputed"] : ["done", "cancelled"];
    wrap.replaceChildren(mkPager(async off => (await db.from("market_deals").select(DSEL).in("status", st).or(`owner_id.eq.${C.fu.id},partner_id.eq.${C.fu.id},guarantor_id.eq.${C.fu.id}`).order("created_at", {ascending:false}).range(off, off + 19)).data || [],
      mkDealCard, tab.v === "cur" ? "Активных сделок нет." : "История пуста.").el);
  };
  box.append(tabs, wrap); draw();
}
async function mkDeal(box, C, id) {
  const { data:d } = await db.from("market_deals").select(DSEL).eq("id", id).maybeSingle();
  if (!d) return box.append(mkEmpty("Сделка не найдена."));
  const noG = d.listing?.kind === "sale", uid = C.fu.id, role = uid === d.owner_id ? "owner" : uid === d.partner_id ? "partner" : uid === d.guarantor_id ? "guarantor" : "staff", party = role === "owner" || role === "partner";
  const back = () => go("market/d/" + id), run = async (name, args, ok) => { if (await mkCall(name, args)) { if (ok) toast(ok); back(); } };
  const { data:log } = await db.from("market_deal_log").select("id,action,note,created_at,actor:forum_profiles!market_deal_log_actor_fkey(username)").eq("deal_id", id).order("created_at", {ascending:false}).limit(40);
  const LOGT = {created:"Сделка создана", guarantor_picked:"Выбран гарант", confirmed:"Подтверждено участие", started:"Обмен начался", cancelled:"Сделка отменена", done_mark:"Отмечен выполненный обмен", finished:"Сделка завершена", dispute:"Открыт спор", resolved_done:"Спор закрыт: обмен засчитан", resolved_cancelled:"Спор закрыт: сделка отменена"};
  const mark = ok => h("span", {class:"mk-ok" + (ok ? " y" : "")}, ok ? "✓ подтвердил" : "ожидает");
  const person = (label, p, flag) => h("div", {class:"mk-row"}, h("small", {}, label), p ? h("span", {}, mkWho(p), d.status === "setup" || d.status === "active" ? mark(flag) : null) : h("span", {class:"meta"}, "не выбран"));
  const acts = h("div", {class:"acts mk-acts"}), hint = h("p", {class:"meta"});
  if (d.status === "setup") {
    if (party) acts.append(h("button", {class:"ghost", onclick:async () => {
      const { data:gs } = await db.rpc("market_guarantor_list"), list = (gs || []).filter(g => g.user_id !== d.owner_id && g.user_id !== d.partner_id);
      if (!list.length) return toast("Сейчас нет доступных гарантов.", 1);
      const s = h("select", {}, h("option", {value:""}, "— выбери гаранта —"), ...list.map(g => h("option", {value:g.user_id}, `${g.display_name || g.username} (@${g.username}) · обменов: ${g.deals_done}`)));
      const v = await modal({title:"Выбор гаранта", text:"Профили и статистику гарантов можно посмотреть во вкладке «Гаранты». После выбора обе стороны и гарант должны подтвердить участие.", body:s, ok:"Выбрать"});
      if (v) run("market_pick_guarantor", {p_deal:id, p_guarantor:v}, "Гарант выбран.");
    }}, d.guarantor_id ? "Сменить гаранта" : "Выбрать гаранта"));
    const mine = role === "owner" ? d.ok_owner : role === "partner" ? d.ok_partner : d.ok_guarantor;
    if (d.guarantor_id && !mine && role !== "staff") acts.append(h("button", {onclick:() => run("market_confirm", {p_deal:id}, "Участие подтверждено.")}, role === "guarantor" ? "Принять сделку" : "Подтвердить участие"));
    if (role !== "staff") acts.append(h("button", {class:"ghost bad", onclick:async () => { if (await modal({title:"Отменить сделку?", text:"Объявление снова станет активным.", ok:"Отменить сделку"}) !== null) run("market_cancel_deal", {p_deal:id}, "Сделка отменена."); }}, "Отменить сделку"));
    hint.textContent = d.guarantor_id ? "Обмен начнётся, когда обе стороны и гарант подтвердят участие." : "Сначала выберите гаранта.";
  } else if (d.status === "active") {
    const done = role === "owner" ? d.done_owner : d.done_partner;
    if (party && !done) acts.append(h("button", {onclick:async () => { if (await modal({title:"Обмен выполнен?", text:"Подтверждай, только если получил всё, о чём договорились. Сделка завершится, когда подтвердят обе стороны.", ok:"Да, всё получено"}) !== null) run("market_mark_done", {p_deal:id}, "Отмечено."); }}, "Обмен выполнен"));
    if (role !== "staff") acts.append(h("button", {class:"ghost bad", onclick:async () => { const v = await modal({title:"Открыть спор", text:"Опиши проблему. Спор рассмотрит администрация.", input:{max:300, ph:"Что пошло не так"}, ok:"Открыть спор"}); if (v === null) return; if (v.length < 5) return toast("Опиши проблему подробнее.", 1); run("market_dispute", {p_deal:id, p_reason:v}, "Спор открыт."); }}, "Открыть спор"));
    hint.textContent = noG ? `Продажа за R$ проходит без гаранта: проведите её сами. Когда всё выполнено, подтвердите обе стороны (продавец — ${d.done_owner ? "да" : "нет"}, покупатель — ${d.done_partner ? "да" : "нет"}).` : `Проведите обмен в игре под присмотром гаранта. Подтвердили: хозяин объявления — ${d.done_owner ? "да" : "нет"}, второй участник — ${d.done_partner ? "да" : "нет"}. Гарант сам сделку не закрывает.`;
    if (noG && party && !d.done_owner && !d.done_partner) acts.append(h("button", {class:"ghost bad", onclick:async () => { if (await modal({title:"Отменить продажу?", text:"Объявление снова станет активным.", ok:"Отменить"}) !== null) run("market_cancel_deal", {p_deal:id}, "Сделка отменена."); }}, "Отменить"));
  } else if (d.status === "disputed") {
    hint.textContent = "Причина спора: " + (d.dispute_reason || "—");
    if (me) acts.append(h("button", {onclick:async () => { const v = await modal({title:"Обмен засчитан?", input:{max:300, ph:"Комментарий администрации"}, ok:"Засчитать"}); if (v !== null) run("market_resolve", {p_deal:id, p_result:"done", p_note:v}, "Закрыто."); }}, "Засчитать обмен"),
      h("button", {class:"ghost bad", onclick:async () => { const v = await modal({title:"Отменить сделку?", input:{max:300, ph:"Комментарий администрации"}, ok:"Отменить"}); if (v !== null) run("market_resolve", {p_deal:id, p_result:"cancelled", p_note:v}, "Закрыто."); }}, "Отменить сделку"));
  } else hint.textContent = d.finished_at ? "Завершена: " + fmt(d.finished_at) : "";
  if (d.guarantor_id && role !== "guarantor") acts.append(h("button", {class:"ghost", onclick:() => mkComplain("guarantor", d.guarantor_id)}, "Жалоба на гаранта"));
  if (role !== "staff") acts.append(h("button", {class:"ghost", onclick:() => mkComplain("deal", id)}, "Пожаловаться на сделку"));
  box.append(h("button", {class:"ghost", style:"margin-bottom:.6rem", onclick:() => go(me && role === "staff" ? "market/admin/disputes" : "market/d")}, "← К сделкам"),
    h("div", {class:"door mk-page"}, h("div", {class:"mk-tags"}, mkBadge(KIND[d.listing?.kind] || "", "kind"), mkBadge(DST[d.status] || d.status, "st-d-" + d.status)),
      h("div", {class:"mk-ex big"}, mkSide("Отдаёт автор", d.listing?.give_items, d.listing?.give, null, true), h("span", {class:"mk-arr", "aria-hidden":"true"}, d.listing?.kind === "sale" ? "→" : "⇄"), mkSide(d.listing?.kind === "sale" ? "Цена" : "Получает автор", d.listing?.want_items, d.listing?.want, d.listing?.kind === "sale" ? d.listing.price_robux : null, true)),
      d.listing?.ingame_nick ? h("div", {class:"mk-row"}, h("small", {}, "Ник автора"), h("span", {}, d.listing.ingame_nick)) : null,
      person(noG ? "Продавец" : "Автор", d.owner, d.ok_owner), person(noG ? "Покупатель" : "Партнёр", d.partner, d.ok_partner), noG ? null : person("Гарант", d.guarantor, d.ok_guarantor),
      h("div", {class:"mk-row"}, h("small", {}, "Объявление"), h("a", {class:"mk-who", href:"#market/l/" + d.listing_id, onclick:e => { e.preventDefault(); go("market/l/" + d.listing_id); }}, "Открыть")),
      hint, acts),
    h("h2", {class:"mk-h"}, "Журнал сделки"), ...((log || []).length ? log.map(x => h("div", {class:"card mk-log"}, h("b", {}, LOGT[x.action] || x.action), x.note ? h("span", {}, " — " + x.note) : null,
      h("div", {class:"meta"}, (x.actor?.username ? "@" + x.actor.username + " · " : "система · ") + fmt(x.created_at)))) : [mkEmpty("Записей нет.")]));
}

/* ---------- 6. личный кабинет ---------- */
async function mkCabinet(box, C, sub) {
  const T = [["my", "Объявления"], ["in", "Входящие"], ["out", "Исходящие"], ["n", "Уведомления" + (C.unread ? ` (${C.unread})` : "")]], uid = C.fu.id;
  if (!T.some(t => t[0] === sub)) sub = "my";
  box.append(h("div", {class:"tabs"}, ...T.map(([k, l]) => h("button", {type:"button", class:sub === k ? "on" : "", onclick:() => go("market/me/" + k)}, l))));
  const wrap = h("div"); box.append(wrap);
  if (sub === "my") return wrap.append(h("button", {class:"fbtn", style:"margin-bottom:.6rem", onclick:() => go("market/new")}, "Создать трейд"),
    mkPager(async off => (await db.from("market_listings").select(LSEL + ",offers:market_offers(count)").eq("author_id", uid).order("created_at", {ascending:false}).range(off, off + 19)).data || [], l => {
      const c = mkCard(l), n = l.offers?.[0]?.count || 0;
      c.append(h("div", {class:"acts", onclick:e => e.stopPropagation()}, h("span", {class:"meta", style:"margin-right:auto"}, "Предложений: " + n),
        l.status === "active" ? h("button", {class:"ghost", onclick:() => go("market/edit/" + l.id)}, "Изменить") : null,
        ["active", "pending", "cancelled"].includes(l.status) ? h("button", {class:"ghost bad", onclick:async () => { if (await modal({title:"Удалить объявление?", ok:"Удалить"}) !== null && await mkCall("market_delete_listing", {p_id:l.id})) { toast("Готово."); go("market/me/my"); } }}, "Удалить") : null));
      return c; }, "У тебя пока нет объявлений.").el);
  if (sub === "in") return wrap.append(mkPager(async off => ((await db.from("market_offers").select(`id,message,status,created_at,listing_id,author:forum_profiles!market_offers_author_fkey(${PRF}),listing:market_listings!market_offers_listing_fkey(id,give,want,author_id,status)`)
    .neq("author_id", uid).eq("status", "pending").order("created_at", {ascending:false}).range(off, off + 19)).data || []).filter(o => o.listing?.author_id === uid),
    o => mkOfferCard(o, o.listing?.status === "active", () => go("market/me/in"), h("div", {class:"mk-det"}, h("b", {}, o.listing?.give), " ⇄ ", h("b", {}, o.listing?.want))), "Новых предложений нет.").el);
  if (sub === "out") return wrap.append(mkPager(async off => (await db.from("market_offers").select(`id,message,status,created_at,listing_id,author:forum_profiles!market_offers_author_fkey(${PRF}),listing:market_listings!market_offers_listing_fkey(id,give,want)`)
    .eq("author_id", uid).order("created_at", {ascending:false}).range(off, off + 19)).data || [],
    o => { const c = mkOfferCard(o, false, null, h("div", {class:"mk-det"}, h("b", {}, o.listing?.give), " ⇄ ", h("b", {}, o.listing?.want)));
      c.append(h("div", {class:"acts"}, h("button", {class:"ghost", onclick:() => go("market/l/" + o.listing_id)}, "Открыть"),
        o.status === "pending" ? h("button", {class:"ghost bad", onclick:async () => { if (await mkCall("market_withdraw_offer", {p_offer:o.id})) { toast("Отозвано."); go("market/me/out"); } }}, "Отозвать") : null)); return c; }, "Ты пока никому не предлагал трейд.").el);
  const { data } = await db.from("market_notifications").select("id,text,listing_id,deal_id,seen,created_at").eq("user_id", uid).order("created_at", {ascending:false}).limit(50);
  wrap.append(...((data || []).length ? data.map(n => h("div", {class:"card mk-n" + (n.seen ? "" : " new"), onclick:() => go(n.deal_id ? "market/d/" + n.deal_id : n.listing_id ? "market/l/" + n.listing_id : "market/me")},
    h("div", {}, n.text), h("div", {class:"meta"}, ago(n.created_at) + " назад"))) : [mkEmpty("Уведомлений пока нет.")]));
  if (C.unread) { await db.rpc("market_mark_read"); }
}

/* ---------- 7. панель администрации маркета ---------- */
async function mkAdmin(box, C, sub) {
  const T = [["complaints", "Жалобы"], ["disputes", "Споры"], ["items", "Вещи"], ["guarantors", "Гаранты"], ["rules", "Управление"], ["log", "Журнал"]];
  if (!T.some(t => t[0] === sub)) sub = "complaints";
  box.append(h("div", {class:"tabs"}, ...T.map(([k, l]) => h("button", {type:"button", class:sub === k ? "on" : "", onclick:() => go("market/admin/" + k)}, l))));
  const wrap = h("div"), back = () => go("market/admin/" + sub); box.append(wrap);
  if (sub === "complaints") return wrap.append(mkPager(async off => (await db.from("market_complaints").select(`id,target_type,target,reason,status,created_at,author:forum_profiles!market_complaints_author_fkey(${PRF})`).eq("status", "open").order("created_at").range(off, off + 19)).data || [],
    c => {
      const T2 = {listing:"объявление", deal:"сделка", guarantor:"гарант", user:"пользователь"};
      const to = () => go(c.target_type === "listing" ? "market/l/" + c.target : c.target_type === "deal" ? "market/d/" + c.target : "market/g");
      return h("div", {class:"card"}, h("div", {class:"mk-tags"}, mkBadge("Жалоба на: " + T2[c.target_type]), mkWho(c.author), h("span", {class:"meta"}, ago(c.created_at) + " назад")), h("div", {class:"mk-det"}, c.reason),
        h("div", {class:"acts"}, c.target_type === "user" ? null : h("button", {class:"ghost", onclick:to}, "Открыть"), h("button", {onclick:async () => { const v = await modal({title:"Закрыть жалобу", input:{max:300, ph:"Решение / комментарий"}, ok:"Закрыть"}); if (v !== null && await mkCall("market_resolve_complaint", {p_id:c.id, p_note:v})) { toast("Закрыто."); back(); } }}, "Закрыть")));
    }, "Открытых жалоб нет.").el);
  if (sub === "disputes") return wrap.append(mkPager(async off => (await db.from("market_deals").select(DSEL).eq("status", "disputed").order("created_at").range(off, off + 19)).data || [], mkDealCard, "Споров нет.").el);
  if (sub === "log") return wrap.append(mkPager(async off => (await db.from("market_deal_log").select("id,deal_id,action,note,created_at,actor:forum_profiles!market_deal_log_actor_fkey(username)").order("created_at", {ascending:false}).range(off, off + 19)).data || [],
    x => h("div", {class:"card mk-log", onclick:() => go("market/d/" + x.deal_id)}, h("b", {}, x.action), x.note ? h("span", {}, " — " + x.note) : null, h("div", {class:"meta"}, (x.actor?.username ? "@" + x.actor.username : "система") + " · " + fmt(x.created_at))), "Записей нет.").el);
  if (sub === "items") {
    await mkCatalog(true);
    const name = h("input", {maxlength:60, placeholder:"Название вещи", autocomplete:"off", "aria-label":"Название вещи"}), file = h("input", {type:"file", accept:"image/jpeg,image/png,image/webp", style:"display:none"}), prev = h("span", {class:"meta"}, "Фото не выбрано");
    file.onchange = () => { prev.textContent = file.files[0] ? file.files[0].name : "Фото не выбрано"; };
    const add = h("button", {type:"button", style:"margin-top:.5rem"}, "Добавить вещь");
    add.onclick = async () => {
      if (name.value.trim().length < 2) return toast("Введи название.", 1); add.disabled = true;
      try { const path = file.files[0] ? await mkUpload(file.files[0]) : null;
        if (await mkCall("market_item_save", {p_id:null, p_name:name.value.trim(), p_image:path, p_active:true})) { toast("Добавлено."); MKC = null; back(); }
      } catch (e) { toast(fe(e, "Не удалось загрузить фото."), 1); } finally { add.disabled = false; }
    };
    const save = async (it, patch) => { if (await mkCall("market_item_save", {p_id:it.id, p_name:it.name, p_image:null, p_active:null, ...patch})) { toast("Сохранено."); MKC = null; back(); } };
    wrap.append(h("div", {class:"door"}, h("b", {}, "Новая вещь"), h("p", {class:"meta"}, "Название и фото (квадрат, обрежется до 512×512). Эти вещи пользователи выбирают при создании трейда."), name,
      h("div", {class:"acts"}, h("button", {class:"ghost", type:"button", onclick:() => file.click()}, "Выбрать фото"), prev), file, add),
      ...(MKC.list.length ? MKC.list.map(it => { const f2 = h("input", {type:"file", accept:"image/jpeg,image/png,image/webp", style:"display:none"});
        f2.onchange = async () => { if (!f2.files[0]) return; try { save(it, {p_image:await mkUpload(f2.files[0])}); } catch (e) { toast(fe(e, "Не удалось загрузить фото."), 1); } };
        return h("div", {class:"card mk-itrow" + (it.active ? "" : " off")}, mkImg(it), h("div", {class:"mk-itm"}, h("b", {}, it.name), h("div", {class:"meta"}, it.active ? "В каталоге" : "Скрыта")),
          h("div", {class:"acts"}, h("button", {class:"ghost", type:"button", onclick:() => f2.click()}, "Фото"), f2,
            h("button", {class:"ghost", type:"button", onclick:async () => { const v = await modal({title:"Название вещи", input:{max:60, ph:it.name}, ok:"Сохранить"}); if (v && v.length >= 2) save(it, {p_name:v}); }}, "Название"),
            h("button", {class:"ghost", type:"button", onclick:() => save(it, {p_active:!it.active})}, it.active ? "Скрыть" : "Показать"))); }) : [mkEmpty("Вещей пока нет. Добавь первую.")]));
    return;
  }
  const nick = h("input", {placeholder:"юзернейм", maxlength:20, autocapitalize:"none", autocomplete:"off", "aria-label":"юзернейм"}), clean = () => nick.value.trim().replace(/^@/, "");
  if (sub === "guarantors") {
    const { data } = await db.from("market_guarantors").select(`user_id,active,p:forum_profiles!market_guarantors_user_fkey(${PRF})`).order("granted_at", {ascending:false});
    wrap.append(h("div", {class:"door"}, h("b", {}, "Выдать статус гаранта"), nick, h("button", {style:"margin-top:.5rem", onclick:async () => { if (clean().length >= 3 && await mkCall("market_set_guarantor", {p_username:clean(), p_on:true})) { toast("Статус выдан."); back(); } }}, "Назначить")),
      ...((data || []).map(g => h("div", {class:"card"}, h("div", {class:"mk-tags"}, mkWho(g.p), mkBadge(g.active ? "Активен" : "Снят")),
        g.active ? h("div", {class:"acts"}, h("button", {class:"ghost bad", onclick:async () => { if (await mkCall("market_set_guarantor", {p_username:g.p.username, p_on:false})) { toast("Статус снят."); back(); } }}, "Снять статус")) : null))));
    return;
  }
  const open = h("button", {class:C.open ? "ghost bad" : "go", onclick:async () => { if (await mkCall("market_set_open", {p_open:!C.open})) { toast(C.open ? "Маркет закрыт." : "Маркет открыт."); back(); } }}, C.open ? "Закрыть маркет" : "Открыть маркет");
  const reason = h("input", {placeholder:"Причина блокировки", maxlength:200});
  wrap.append(h("div", {class:"door"}, h("b", {}, "Доступность маркета"), h("p", {class:"meta"}, C.open ? "Маркет открыт. При закрытии новые действия отключаются, просмотр остаётся." : "Маркет закрыт для действий."), open),
    h("div", {class:"door", style:"margin-top:.7rem"}, h("b", {}, "Блокировка в маркете"), h("p", {class:"meta"}, "Скрывает активные объявления и снимает статус гаранта. Форум не затрагивается."), nick, reason,
      h("div", {class:"acts"}, h("button", {class:"ghost", onclick:async () => { if (clean().length >= 3 && await mkCall("market_block", {p_username:clean(), p_on:false, p_reason:""})) toast("Разблокирован."); }}, "Разблокировать"),
        h("button", {class:"bad", onclick:async () => { if (clean().length < 3) return; if (await modal({title:"Заблокировать @" + clean() + "?", ok:"Заблокировать"}) !== null && await mkCall("market_block", {p_username:clean(), p_on:true, p_reason:reason.value.trim()})) toast("Заблокирован."); }}, "Заблокировать"))));
}
