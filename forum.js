"use strict";
/* Форум DorsoTic. Использует db, h, fld, toast, modal, ago, me, ROLE, go из app.js.
   Весь пользовательский текст выводится только как текст (без innerHTML). */
const IMG_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|webp)$/, SEL = "id,parent_id,body,image_path,created_at,author,forum_profiles!posts_author_fkey(username,display_name,avatar_path),likes(count),replies:posts!parent_id(count)";
const mbf = b => (b / 1048576).toFixed(1);
const bad = m => Object.assign(new Error(m), {code:"P0001"});
const fe = (e, d) => e?.code === "P0001" ? e.message : /row-level|exceed|too large|payload/i.test(e?.message || "") ? "Лимит хранилища или размер файла превышен." : d;
let fu = null, fmode = "in", fmail = "", fRefresh = () => {}, fRoles = {};

const reload = () => go(location.hash.slice(1) || "forum");
db.auth.onAuthStateChange((ev, s) => {
  const id = s?.user?.id || null;
  if (id === (fu?.id || null)) return;               // токен обновился, ничего не меняется
  fu = s?.user || null;
  if (location.hash.startsWith("#forum")) setTimeout(reload, 0);
});

/* Сжатие картинки: ≤1280px, JPEG ≤900 КБ. Заодно убирает EXIF и геометки. */
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw bad("Только jpg, png или webp.");
  if (file.size > 8 * 1048576) throw bad("Файл слишком большой (до 8 МБ).");
  let bmp; try { bmp = await createImageBitmap(file); } catch { throw bad("Не удалось открыть картинку."); }
  const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [.86, .76, .64, .52, .4]) { const b = await new Promise(r => c.toBlob(r, "image/jpeg", q)); if (b && b.size <= 2.5 * 1048576) return b; }
  throw bad("Не удалось сжать картинку.");
}

/* ---------- вход и регистрация ---------- */
function authCard() {
  const box = h("div", {class:"door"}), msg = h("div", {class:"msg err", role:"alert"});
  const em = h("input", {type:"email", placeholder:"Почта", autocomplete:"email", maxlength:120, value:fmail});
  const pw = h("input", {type:"password", placeholder:"Пароль, от 10 символов", autocomplete:fmode === "up" ? "new-password" : "current-password", maxlength:72});
  const cd = h("input", {inputmode:"numeric", placeholder:"Код из письма", maxlength:8, autocomplete:"one-time-code"});
  const run = (b, fn) => async () => {
    msg.className = "msg err"; msg.textContent = ""; fmail = em.value.trim().toLowerCase() || fmail; b.disabled = true;
    try { await fn(); } catch (e) { msg.textContent = fe(e, "Что-то пошло не так. Попробуй позже."); } finally { b.disabled = false; }
  };
  const chk = () => { if (!/^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(fmail)) throw bad("Проверь адрес почты."); };
  const tabs = h("div", {class:"tabs"}, ...[["in", "Вход"], ["up", "Регистрация"]].map(([m, l]) => h("button", {class:fmode === m || (fmode === "verify" && m === "up") ? "on" : "", onclick:() => { fmode = m; reload(); }}, l)));

  if (fmode === "verify") {
    const ok = h("button", {class:"go"}, "Подтвердить"), again = h("button", {class:"lk2", type:"button"}, "Отправить код ещё раз");
    ok.onclick = run(ok, async () => {
      if (!/^\d{6,8}$/.test(cd.value.trim())) throw bad("Введи код из письма (6–8 цифр).");
      const { error } = await db.auth.verifyOtp({email:fmail, token:cd.value.trim(), type:"signup"});
      if (error) throw bad("Код неверный или истёк."); fmode = "in";
    });
    again.onclick = run(again, async () => { const { error } = await db.auth.resend({type:"signup", email:fmail}); if (error) throw bad("Подожди минуту перед повторной отправкой."); toast("Код отправлен."); });
    cd.onkeydown = e => { if (e.key === "Enter") ok.click(); };
    box.append(tabs, h("p", {class:"meta"}, `Мы отправили код на ${fmail}. Проверь папку «Спам». Если кода нет, возможно, эта почта уже зарегистрирована: попробуй войти.`), fld("Код", cd), ok, msg,
      h("div", {class:"acts"}, again, h("button", {class:"lk2", type:"button", onclick:() => { fmode = "up"; reload(); }}, "Другая почта")));
    return box;
  }
  const main = h("button", {class:"go"}, fmode === "in" ? "Войти" : "Создать аккаунт");
  main.onclick = run(main, async () => {
    chk();
    if (fmode === "in") {
      const { error } = await db.auth.signInWithPassword({email:fmail, password:pw.value});
      if (error) {
        if (/confirm/i.test(error.message)) { await db.auth.resend({type:"signup", email:fmail}); fmode = "verify"; reload(); return; } // почта ещё не подтверждена
        throw bad("Неверная почта или пароль.");
      }
      return;
    }
    if (pw.value.length < 10) throw bad("Пароль: минимум 10 символов.");
    const { data, error } = await db.auth.signUp({email:fmail, password:pw.value});
    if (error) throw bad(/rate/i.test(error.message) ? "Слишком много попыток, подожди." : "Не удалось зарегистрироваться.");
    if (!data.session) { fmode = "verify"; reload(); }
  });
  pw.onkeydown = em.onkeydown = e => { if (e.key === "Enter") main.click(); };
  box.append(tabs, fld("Почта", em), fld("Пароль", pw), main, msg, h("div", {class:"meta"}, "Читать форум можно без аккаунта. Почту никто не увидит: на форуме виден только ник."));
  return box;
}

/* ---------- иконки (только мои константы, пользовательский текст сюда не попадает) ---------- */
const ICONS = {
  heart:'<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 5 6.8 5c1.9 0 3.5 1 5.2 3 1.7-2 3.3-3 5.2-3 3.2 0 5.1 3 4 6.2-1.7 4.7-9.2 9.3-9.2 9.3z"/></svg>',
  comment:'<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.7 7L4 20.5l1.5-4.9A8 8 0 1 1 21 12z"/></svg>',
  image:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 9"/></svg>',
  trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  close:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  back:'<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  ban:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  pen:'<svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3"/></svg>',
  bell:'<svg viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/></svg>',
  search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
  link:'<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  camera:'<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
};
const ic = n => { const s = h("span", {class:"ico"}); s.innerHTML = ICONS[n]; return s; };
const AV_RE = /^[0-9a-f-]{36}\/a_[0-9a-f-]{36}\.jpg$/, BN_RE = /^[0-9a-f-]{36}\/b_[0-9a-f-]{36}\.jpg$/, MY = "id,username,display_name,bio,avatar_path,banner_path,banned,created_at,notif_seen_at";
const pubUrl = p => db.storage.from("forum").getPublicUrl(p).data.publicUrl;
const nameOf = pr => pr?.display_name || pr?.username || "?";
let fcur = () => {}, fdraft = {}, fnTimer = 0;
const needLogin = () => { toast("Войди или зарегистрируйся, чтобы это сделать.", 1); window.scrollTo({top:0, behavior:"smooth"}); };
const lightbox = src => { const o = h("div", {class:"lb", onclick:() => o.remove()}, h("img", {src, alt:"Изображение"})); document.body.append(o); };

function avatar(pr, cls = "") {
  const d = h("div", {class:"av " + cls}), ini = () => d.replaceChildren((nameOf(pr)[0] || "?").toUpperCase());
  if (AV_RE.test(pr?.avatar_path || "")) { const i = h("img", {src:pubUrl(pr.avatar_path), alt:"", loading:"lazy"}); i.onerror = ini; d.append(i); } else ini();
  return d;
}
async function cropImg(file, W, H, q) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw bad("Только jpg, png или webp.");
  if (file.size > 8 * 1048576) throw bad("Файл слишком большой (до 8 МБ).");
  let bmp; try { bmp = await createImageBitmap(file); } catch { throw bad("Не удалось открыть картинку."); }
  const k = Math.min(bmp.width / W, bmp.height / H), sw = W * k, sh = H * k, c = document.createElement("canvas"); c.width = W; c.height = H;
  c.getContext("2d").drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, W, H);
  const b = await new Promise(r => c.toBlob(r, "image/jpeg", q)); if (!b) throw bad("Не удалось обработать картинку."); return b;
}
const cropAvatar = f => cropImg(f, 320, 320, .86), cropBanner = f => cropImg(f, 1200, 400, .82);
function banner(pr, cls = "") {
  const d = h("div", {class:"cover " + cls});
  if (BN_RE.test(pr?.banner_path || "")) { const i = h("img", {src:pubUrl(pr.banner_path), alt:"", loading:"lazy"}); i.onerror = () => { d.classList.remove("has"); i.remove(); }; d.classList.add("has"); d.append(i); }
  return d;
}

/* ---------- редактирование профиля ---------- */
function editProfile(mine, done) {
  const bd = h("div", {class:"sheet-bd"}); let blob = null, url = null, bnBlob = null, bnUrl = null, bnDel = false;
  const close = () => { if (url) URL.revokeObjectURL(url); if (bnUrl) URL.revokeObjectURL(bnUrl); document.removeEventListener("keydown", esc); bd.remove(); };
  const esc = e => { if (e.key === "Escape") close(); };
  const msg = h("div", {class:"msg err", role:"alert"});
  const dn = h("input", {maxlength:30, placeholder:"Имя, как тебя видят", value:mine.display_name || ""});
  const un = h("input", {maxlength:20, placeholder:"юзернейм", value:mine.username, autocapitalize:"none", autocomplete:"off"});
  const bio = h("textarea", {class:"bio", maxlength:160, placeholder:"О себе"}); bio.value = mine.bio || "";
  const file = h("input", {type:"file", accept:"image/jpeg,image/png,image/webp", style:"display:none"});
  const avBtn = h("button", {class:"avedit", type:"button", "aria-label":"Сменить аватар", onclick:() => file.click()}, avatar(mine, "lg"), h("span", {class:"cam"}, ic("camera")));
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    try { blob = await cropAvatar(f); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob); avBtn.querySelector(".av").replaceChildren(h("img", {src:url, alt:""})); msg.textContent = ""; }
    catch (e) { msg.textContent = fe(e, "Не удалось открыть картинку."); }
  };
  const bnFile = h("input", {type:"file", accept:"image/jpeg,image/png,image/webp", style:"display:none"});
  const bnPrev = banner(mine), paintBn = () => bnPrev.classList.contains("has") || bnPrev.classList.add("empty");
  const bnBtn = h("button", {class:"bnedit", type:"button", "aria-label":"Сменить баннер", onclick:() => bnFile.click()}, bnPrev, h("span", {class:"cam"}, ic("camera")));
  const bnRm = h("button", {class:"ghost bnrm", type:"button", onclick:() => { bnBlob = null; bnDel = true; if (bnUrl) { URL.revokeObjectURL(bnUrl); bnUrl = null; } bnPrev.replaceChildren(); bnPrev.classList.remove("has"); bnRm.hidden = true; }}, "Убрать баннер");
  bnRm.hidden = !BN_RE.test(mine.banner_path || "");
  bnFile.onchange = async () => {
    const f = bnFile.files[0]; if (!f) return;
    try { bnBlob = await cropBanner(f); bnDel = false; if (bnUrl) URL.revokeObjectURL(bnUrl); bnUrl = URL.createObjectURL(bnBlob); bnPrev.replaceChildren(h("img", {src:bnUrl, alt:""})); bnPrev.classList.add("has"); bnRm.hidden = false; msg.textContent = ""; }
    catch (e) { msg.textContent = fe(e, "Не удалось открыть картинку."); }
    bnFile.value = "";
  };
  const save = h("button", {class:"go pub", type:"button"}, "Сохранить");
  save.onclick = async () => {
    msg.textContent = ""; const u = un.value.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return void (msg.textContent = "Юзернейм: a-z, 0-9, _, от 3 до 20 символов.");
    save.disabled = true; let path = null, bnPath = null;
    try {
      if (blob) { path = `${fu.id}/a_${crypto.randomUUID()}.jpg`; const { error } = await db.storage.from("forum").upload(path, blob, {contentType:"image/jpeg", upsert:false}); if (error) { path = null; throw error; } }
      if (bnBlob) { bnPath = `${fu.id}/b_${crypto.randomUUID()}.jpg`; const { error } = await db.storage.from("forum").upload(bnPath, bnBlob, {contentType:"image/jpeg", upsert:false}); if (error) { bnPath = null; throw error; } }
      const upd = {username:u, display_name:dn.value.trim() || null, bio:bio.value.trim() || null}; if (path) upd.avatar_path = path;
      if (bnPath) upd.banner_path = bnPath; else if (bnDel) upd.banner_path = null;
      const { error } = await db.from("forum_profiles").update(upd).eq("id", fu.id);
      if (error) { const bad = [path, bnPath].filter(Boolean); if (bad.length) await db.storage.from("forum").remove(bad); throw error; }
      if (path && AV_RE.test(mine.avatar_path || "")) await db.storage.from("forum").remove([mine.avatar_path]);
      if ((bnPath || bnDel) && BN_RE.test(mine.banner_path || "")) await db.storage.from("forum").remove([mine.banner_path]);
      close(); toast("Профиль сохранён."); done();
    } catch (e) { msg.textContent = e?.code === "23505" ? "Этот юзернейм занят." : fe(e, "Не получилось сохранить."); save.disabled = false; }
  };
  bd.onclick = e => { if (e.target === bd) close(); };
  document.addEventListener("keydown", esc);
  bd.append(h("div", {class:"sheet", role:"dialog", "aria-label":"Редактирование профиля"}, h("div", {class:"grab"}),
    h("div", {class:"sh-top"}, h("button", {class:"ib", type:"button", "aria-label":"Закрыть", onclick:close}, ic("close")), save),
    h("div", {class:"bnwrap"}, bnBtn, bnRm), bnFile,
    h("div", {style:"display:flex;justify-content:center;margin-top:-2.6rem;position:relative"}, avBtn), file,
    fld("Имя", dn), fld("Юзернейм (a-z, 0-9, _)", un), fld("О себе", bio), msg));
  document.body.append(bd);
}

/* ---------- окно написания (выезжает снизу) ---------- */
function sheet(parent, done) {
  const key = parent || "root", bd = h("div", {class:"sheet-bd"}); let url = null;
  const close = () => { fdraft[key] = ta.value; if (url) URL.revokeObjectURL(url); document.removeEventListener("keydown", esc); bd.remove(); };
  const esc = e => { if (e.key === "Escape") close(); };
  const ta = h("textarea", {maxlength:500, placeholder:parent ? "Напиши комментарий" : "Что нового?", "aria-label":"Текст"}); ta.value = fdraft[key] || "";
  const cnt = h("span", {class:"meta"}), msg = h("div", {class:"msg err", role:"alert"});
  const file = h("input", {type:"file", accept:"image/jpeg,image/png,image/webp", style:"display:none"});
  const img = h("img", {alt:"Выбранная картинка"}), prev = h("div", {class:"prev", style:"display:none"}, img);
  const pub = h("button", {class:"go pub", type:"button"}, parent ? "Ответить" : "Опубликовать");
  const upd = () => { cnt.textContent = `${ta.value.length}/500`; pub.disabled = !ta.value.trim() && !file.files[0]; };
  const clearImg = () => { file.value = ""; if (url) URL.revokeObjectURL(url); url = null; prev.style.display = "none"; upd(); };
  prev.append(h("button", {class:"ib x", type:"button", "aria-label":"Убрать картинку", onclick:clearImg}, ic("close")));
  file.onchange = () => { const f = file.files[0]; if (!f) return clearImg(); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(f); img.src = url; prev.style.display = ""; upd(); };
  ta.oninput = upd;
  pub.onclick = async () => {
    msg.textContent = ""; const body = ta.value.trim(), f = file.files[0]; if (!body && !f) return; pub.disabled = true; let path = null;
    try {
      if (f) { const blob = await shrink(f); path = `${fu.id}/${crypto.randomUUID()}.jpg`; const { error } = await db.storage.from("forum").upload(path, blob, {contentType:"image/jpeg", upsert:false}); if (error) { path = null; throw error; } }
      const { error } = await db.from("posts").insert({author:fu.id, parent_id:parent || null, body, image_path:path});
      if (error) { if (path) await db.storage.from("forum").remove([path]); throw error; }
      ta.value = ""; fdraft[key] = ""; close(); toast("Опубликовано."); fRefresh(); done();
    } catch (e) { msg.textContent = fe(e, "Не получилось отправить. Попробуй позже."); upd(); }
  };
  bd.onclick = e => { if (e.target === bd) close(); };
  document.addEventListener("keydown", esc);
  bd.append(h("div", {class:"sheet", role:"dialog", "aria-label":"Новое сообщение"}, h("div", {class:"grab"}),
    h("div", {class:"sh-top"}, h("button", {class:"ib", type:"button", "aria-label":"Закрыть", onclick:close}, ic("close")), pub), ta, prev, msg,
    h("div", {class:"tools"}, h("button", {class:"ib", type:"button", "aria-label":"Добавить картинку", onclick:() => file.click()}, ic("image")), file, h("span", {style:"flex:1"}), cnt)));
  document.body.append(bd); upd(); ta.focus();
}

/* нижняя строка сообщений */
function msgBar(label, onclick) {
  document.getElementById("fbar")?.remove(); if (!label) return;
  document.body.append(h("div", {id:"fbar"}, h("button", {type:"button", onclick}, ic("pen"), h("span", {}, label))));
}

/* ---------- пост или комментарий ---------- */
function postCard(p, liked, c) {
  const pr = p.forum_profiles || {}, u = pr.username || "?", role = fRoles[u], img = IMG_RE.test(p.image_path || "") ? pubUrl(p.image_path) : null;
  let n = p.likes?.[0]?.count || 0, on = liked;
  const cnt = h("span"), lk = h("button", {class:"ib", type:"button", "aria-label":"Нравится"}, ic("heart"), cnt);
  const paint = () => { lk.classList.toggle("on", on); cnt.textContent = n || ""; }; paint();
  lk.onclick = async e => {
    e.stopPropagation(); if (!fu) return needLogin(); lk.disabled = true;
    const { error } = on ? await db.from("likes").delete().eq("post_id", p.id).eq("user_id", fu.id) : await db.from("likes").insert({post_id:p.id, user_id:fu.id});
    lk.disabled = false; if (error) return toast("Не удалось.", 1); on = !on; n += on ? 1 : -1; paint();
  };
  const act = h("div", {class:"tw-act"}, h("button", {class:"ib", type:"button", "aria-label":"Ответить", onclick:e => { e.stopPropagation(); c.reply(p); }}, ic("comment"), h("span", {}, p.replies?.[0]?.count || "")), lk, h("button", {class:"ib", type:"button", "aria-label":"Скопировать ссылку", onclick:e => { e.stopPropagation(); copy(location.origin + location.pathname + "#forum/p/" + p.id, "Ссылка скопирована."); }}, ic("link")));
  if (fu && (p.author === fu.id || me)) act.append(h("button", {class:"ib del", type:"button", "aria-label":"Удалить", onclick:async e => {
    e.stopPropagation(); if (await modal({title:"Удалить?", text:"Вместе со всеми ответами. Это нельзя отменить.", ok:"Удалить"}) === null) return;
    const { data: rs } = await db.from("posts").select("image_path").eq("parent_id", p.id);
    const paths = [p.image_path, ...(rs || []).map(r => r.image_path)].filter(x => x && IMG_RE.test(x));
    if (paths.length) await db.storage.from("forum").remove(paths);
    const { error } = await db.from("posts").delete().eq("id", p.id); if (error) return toast("Не удалось удалить.", 1);
    fRefresh(); c.after();
  }}, ic("trash")));
  if (me && me.role !== "moderator" && p.author !== fu?.id) act.append(h("button", {class:"ib del", type:"button", "aria-label":"Заблокировать автора", onclick:async e => {
    e.stopPropagation(); if (await modal({title:`Заблокировать @${u}?`, text:"Он больше не сможет писать и загружать картинки.", ok:"Заблокировать"}) === null) return;
    const { error } = await db.rpc("forum_ban", {p_uid:p.author, p_ban:true}); toast(error ? fe(error, "Не удалось.") : "Заблокирован.", !!error);
  }}, ic("ban")));
  const goP = e => { e.stopPropagation(); c.prof(u); }, av = avatar(pr, "avlink"); av.onclick = goP;
  const im = img ? h("img", {src:img, alt:"Изображение", loading:"lazy"}) : null; if (im) im.onclick = e => { e.stopPropagation(); lightbox(img); };
  return h("div", {class:"tw-row" + (c.big ? " big" : "") + (c.anc ? " anc" : ""), onclick:() => c.open && c.open(p)}, h("div", {class:"avcol"}, av),
    h("div", {class:"tw-main"}, h("div", {class:"tw-top"}, h("b", {class:"nmlink", onclick:goP}, nameOf(pr)), role ? h("span", {class:"badge"}, ROLE[role] || role) : null, h("span", {class:"meta"}, "@" + u + " · " + ago(p.created_at))),
      p.body ? h("div", {class:"tw-txt"}, p.body) : null, im, act));
}

/* ---------- страница форума ---------- */
async function forum(box) {
  const { data: { session } } = await db.auth.getSession(); fu = session?.user || null;
  const rl = await db.rpc("staff_public"); fRoles = Object.fromEntries((rl.data || []).map(x => [x.nickname, x.role]));
  let mine = null, tab = "all", bell = null;
  const loadMine = async () => { if (fu) { const { data } = await db.from("forum_profiles").select(MY).eq("id", fu.id).maybeSingle(); mine = data; } };
  await loadMine(); $("app").classList.add("tw");
  const top = h("div"), wrap = h("div", {class:"vw"});
  if (!fu) box.append(authCard());
  else if (!mine) box.append(h("div", {class:"door"}, h("p", {}, "Профиль форума не найден. Выйди и войди снова."), h("button", {onclick:() => db.auth.signOut()}, "Выйти")));
  box.append(top, wrap);
  const canPost = () => !!(fu && mine && !mine.banned);
  const write = (parent, done) => canPost() ? sheet(parent, done) : fu && mine?.banned ? toast("Аккаунт заблокирован.", 1) : needLogin();
  const show = (...els) => { wrap.replaceChildren(...els); wrap.classList.remove("vw"); void wrap.offsetWidth; wrap.classList.add("vw"); };
  const refresh = () => fcur(), view = fn => { fcur = fn; fn(); };
  const link = path => location.origin + location.pathname + "#forum/" + path;
  const to = (fn, path) => { history.pushState({f:1}, "", "#forum/" + path); window.scrollTo(0, 0); view(fn); };
  const back = () => { window.scrollTo(0, 0); if (history.state?.f) history.back(); else { history.replaceState(null, "", "#forum"); tab = "all"; showFeed(); } };
  const C = {open:p => to(() => showThread(p), "p/" + p.id), reply:p => write(p.id, refresh), after:refresh, prof:name => to(() => showProfile(name), "u/" + name)};
  const skel = n => h("div", {}, ...Array.from({length:n}, () => h("div", {class:"tw-row sk-row"}, h("div", {class:"av sk"}), h("div", {class:"tw-main"}, h("div", {class:"sk l1"}), h("div", {class:"sk l2"}), h("div", {class:"sk l3"})))));
  const backHdr = t => h("div", {class:"fh"}, h("button", {class:"ib", type:"button", "aria-label":"Назад", onclick:back}, ic("back")), h("b", {}, t));
  const empty = t => h("p", {class:"empty", style:"padding:1.2rem .9rem"}, t);
  const setBell = n => { if (bell) { bell.textContent = n > 9 ? "9+" : n; bell.style.display = n ? "" : "none"; } };

  const page = async (list, off, c, filt, emptyT, asc) => {
    const { data, error } = await filt(db.from("posts").select(SEL)).order("created_at", {ascending:!!asc}).range(off, off + 19);
    if (error) { list.append(empty("Не удалось загрузить.")); return 0; }
    let liked = new Set();
    if (fu && data.length) { const { data: l } = await db.from("likes").select("post_id").eq("user_id", fu.id).in("post_id", data.map(x => x.id)); liked = new Set((l || []).map(x => x.post_id)); }
    data.forEach((p, i) => { const r = postCard(p, liked.has(p.id), c); r.style.setProperty("--i", Math.min(i, 8)); list.append(r); });
    if (!off && !data.length) list.append(empty(emptyT));
    return data.length;
  };
  const moreBtn = () => h("button", {class:"ghost", style:"margin:.9rem auto;display:block"}, "Показать ещё");
  const withMore = (c, filt, emptyT, asc) => {
    const list = h("div"), more = moreBtn(); let off = 0;
    const next = async () => { more.disabled = true; const k = await page(list, off, c, filt, emptyT, asc); off += k; more.disabled = false; more.style.display = k < 20 ? "none" : "block"; };
    more.onclick = next; const sk = skel(2); list.append(sk); next().then(() => sk.remove()); return h("div", {}, list, more);
  };
  const mySet = async ids => { if (!fu || !ids.length) return new Set(); const { data } = await db.from("follows").select("following").eq("follower", fu.id).in("following", ids); return new Set((data || []).map(x => x.following)); };
  const personRow = (pr, set) => {
    let on = set.has(pr.id); const b = h("button", {class:"fbtn sm", type:"button"}), paint = () => { b.classList.toggle("on", on); b.textContent = on ? "Вы подписаны" : "Подписаться"; }; paint();
    b.onclick = async e => {
      e.stopPropagation(); if (!fu) return needLogin(); b.disabled = true;
      const { error } = on ? await db.from("follows").delete().eq("follower", fu.id).eq("following", pr.id) : await db.from("follows").insert({follower:fu.id, following:pr.id});
      b.disabled = false; if (error) return toast(fe(error, "Не удалось."), 1); on = !on; paint();
    };
    return h("div", {class:"tw-row", onclick:() => C.prof(pr.username)}, h("div", {class:"avcol"}, avatar(pr, "avlink")),
      h("div", {class:"tw-main"}, h("div", {class:"tw-top"}, h("b", {}, nameOf(pr)), h("span", {class:"meta"}, "@" + pr.username)), pr.bio ? h("div", {class:"tw-txt"}, pr.bio) : null), fu?.id === pr.id ? null : b);
  };
  const people = (load, emptyT) => {
    const list = h("div"), more = moreBtn(); let off = 0;
    const next = async () => {
      more.disabled = true; const rows = await load(off), set = await mySet(rows.map(r => r.id));
      rows.forEach((r, i) => { const e = personRow(r, set); e.style.setProperty("--i", Math.min(i, 8)); list.append(e); });
      if (!off && !rows.length) list.append(empty(emptyT)); off += rows.length; more.disabled = false; more.style.display = rows.length < 30 ? "none" : "block";
    };
    more.onclick = next; next(); return h("div", {}, list, more);
  };

  async function showFeed() {
    fcur = showFeed; bell = null;
    const tabs = h("div", {class:"ftabs"}, ...[["all", "Все"], ["sub", "Подписки"]].map(([k, l]) => h("button", {type:"button", class:tab === k ? "on" : "", onclick:() => { if (tab !== k) { tab = k; history.replaceState(history.state, "", "#forum" + (k === "sub" ? "/sub" : "")); showFeed(); } }}, l)));
    const badge = h("span", {class:"dot", style:"display:none"});
    top.replaceChildren(h("div", {class:"ftop"}, tabs,
      h("button", {class:"ib sq", type:"button", "aria-label":"Поиск людей", onclick:() => to(showSearch, "s")}, ic("search")),
      fu ? h("button", {class:"ib sq rel", type:"button", "aria-label":"Уведомления", onclick:() => to(showNotifs, "n")}, ic("bell"), badge) : null,
      mine ? h("button", {class:"avbtn", type:"button", "aria-label":"Мой профиль", onclick:() => C.prof(mine.username)}, avatar(mine, "avlink")) : null));
    bell = badge; msgBar(mine?.banned ? null : fu ? "Что нового?" : "Войди, чтобы писать", () => write(null, refresh));
    if (fu) { const poll = async () => { if (!document.body.contains(top)) return clearInterval(fnTimer); const { data } = await db.rpc("forum_unread"); setBell(data || 0); }; poll(); clearInterval(fnTimer); fnTimer = setInterval(poll, 60000); }
    if (tab === "sub") {
      if (!fu) return show(empty("Войди, чтобы видеть публикации тех, на кого подписан."));
      const { data } = await db.from("follows").select("following").eq("follower", fu.id).limit(150), ids = (data || []).map(x => x.following);
      if (!ids.length) return show(empty("Ты пока ни на кого не подписан. Найди людей через поиск или нажми на имя автора под постом."));
      return show(withMore(C, q => q.is("parent_id", null).in("author", ids), "Пока нет постов от тех, на кого ты подписан."));
    }
    show(withMore(C, q => q.is("parent_id", null), "Пока тихо. Напиши первым!"));
  }

  async function showThread(p0) {
    top.replaceChildren(backHdr("Пост")); msgBar(null); show(skel(2));
    const { data } = await db.from("posts").select(SEL).eq("id", p0.id).maybeSingle();
    if (!data) return show(empty("Пост удалён или не существует."));
    const anc = []; let pid = data.parent_id;
    while (pid && anc.length < 6) { const { data: a } = await db.from("posts").select(SEL).eq("id", pid).maybeSingle(); if (!a) break; anc.unshift(a); pid = a.parent_id; }
    const all = [data, ...anc]; let liked = new Set();
    if (fu) { const { data: l } = await db.from("likes").select("post_id").eq("user_id", fu.id).in("post_id", all.map(x => x.id)); liked = new Set((l || []).map(x => x.post_id)); }
    msgBar(mine?.banned ? null : "Ответить @" + (data.forum_profiles?.username || ""), () => write(data.id, refresh));
    show(...anc.map(a => postCard(a, liked.has(a.id), {...C, anc:true})), postCard(data, liked.has(data.id), {...C, big:true, open:null, reply:() => write(data.id, refresh), after:back}),
      withMore(C, q => q.eq("parent_id", data.id), "Комментариев пока нет. Напиши первым!", true));
  }

  async function showProfile(name) {
    top.replaceChildren(backHdr("Профиль")); msgBar(null); show(skel(2));
    const { data: pr } = await db.from("forum_profiles").select(MY).eq("username", name).maybeSingle();
    if (!pr) return show(empty("Профиль не найден."));
    const id = pr.id, c = f => f.then(r => r.count || 0), hd = {count:"exact", head:true};
    const [fing, fers, np] = await Promise.all([c(db.from("follows").select("*", hd).eq("follower", id)), c(db.from("follows").select("*", hd).eq("following", id)), c(db.from("posts").select("*", hd).eq("author", id).is("parent_id", null))]);
    const self = fu?.id === id; let isF = false, nf = fers;
    if (fu && !self) { const { data } = await db.from("follows").select("follower").eq("follower", fu.id).eq("following", id).maybeSingle(); isF = !!data; }
    const stat = (n, t, kind) => h("button", {class:"stbtn", type:"button", onclick:() => to(() => showPeople(pr.username, kind), `u/${pr.username}/${kind}`)}, h("b", {}, String(n)), " " + t);
    const stats = h("div", {class:"pstats"}), paintS = () => stats.replaceChildren(stat(fing, "подписок", "following"), stat(nf, "подписчиков", "followers"), h("span", {}, h("b", {}, String(np)), " постов"));
    paintS();
    const lnk = h("button", {class:"ib sq", type:"button", "aria-label":"Скопировать ссылку", onclick:() => copy(link("u/" + pr.username), "Ссылка скопирована.")}, ic("link"));
    const act = h("div", {class:"pa"}, lnk);
    if (self) act.append(h("button", {class:"ghost", onclick:() => editProfile(pr, async () => { await loadMine(); if (mine && mine.username !== pr.username) { history.replaceState(history.state, "", "#forum/u/" + mine.username); fcur = () => showProfile(mine.username); } refresh(); })}, "Редактировать"), h("button", {class:"ghost", onclick:() => db.auth.signOut()}, "Выйти"));
    else {
      const fb = h("button", {class:"fbtn", type:"button"}), paintF = () => { fb.classList.toggle("on", isF); fb.textContent = isF ? "Вы подписаны" : "Подписаться"; }; paintF();
      fb.onclick = async () => {
        if (!fu) return needLogin(); fb.disabled = true;
        const { error } = isF ? await db.from("follows").delete().eq("follower", fu.id).eq("following", id) : await db.from("follows").insert({follower:fu.id, following:id});
        fb.disabled = false; if (error) return toast(fe(error, "Не удалось."), 1); isF = !isF; nf += isF ? 1 : -1; paintF(); paintS();
      };
      act.append(fb);
    }
    const role = fRoles[pr.username], lst = h("div"); let ptab = "posts";
    const ptabs = h("div", {class:"ftabs", style:"margin:.4rem .85rem"}), loadTab = () => {
      ptabs.replaceChildren(...[["posts", "Посты"], ["replies", "Ответы"]].map(([k, l]) => h("button", {type:"button", class:ptab === k ? "on" : "", onclick:() => { ptab = k; loadTab(); }}, l)));
      lst.replaceChildren(withMore(C, q => ptab === "posts" ? q.eq("author", id).is("parent_id", null) : q.eq("author", id).not("parent_id", "is", null), ptab === "posts" ? "Пока нет постов." : "Пока нет ответов."));
    };
    const parts = [h("div", {class:"pcard"}, banner(pr), h("div", {class:"phead"}, avatar(pr, "lg"), act),
      h("div", {class:"pinfo"}, h("h2", {}, nameOf(pr), role ? h("span", {class:"badge"}, ROLE[role] || role) : null), h("div", {class:"meta"}, "@" + pr.username),
        pr.bio ? h("div", {class:"pbio"}, pr.bio) : null, h("div", {class:"meta", style:"margin-top:.4rem"}, "На форуме с " + new Date(pr.created_at).toLocaleDateString("ru-RU", {month:"long", year:"numeric"})), stats))];
    if (self) {
      const bar = h("i"), txt = h("div", {class:"meta"});
      fRefresh = async () => { const { data } = await db.rpc("forum_usage"); if (!data) return; txt.textContent = `Хранилище: ${mbf(data.used)} из ${mbf(data.limit)} МБ`; bar.style.width = Math.min(100, data.used / data.limit * 100) + "%"; }; fRefresh();
      parts.push(h("div", {class:"usage"}, txt, h("div", {class:"bar"}, bar), h("div", {class:"meta"}, "Лимиты: 100 МБ, 40 сообщений и 20 картинок в сутки, пауза 15 секунд.")));
    }
    loadTab(); show(...parts, ptabs, lst);
  }

  async function showPeople(name, kind) {
    top.replaceChildren(backHdr((kind === "followers" ? "Подписчики" : "Подписки") + " @" + name)); msgBar(null); show(skel(2));
    const { data: pr } = await db.from("forum_profiles").select("id").eq("username", name).maybeSingle(); if (!pr) return show(empty("Профиль не найден."));
    const col = kind === "followers" ? "following" : "follower", other = kind === "followers" ? "follower" : "following";
    show(people(async off => { const { data } = await db.from("follows").select(`p:forum_profiles!follows_${other}_fkey(id,username,display_name,avatar_path,bio)`).eq(col, pr.id).order("created_at", {ascending:false}).range(off, off + 29); return (data || []).map(x => x.p).filter(Boolean); },
      kind === "followers" ? "Подписчиков пока нет." : "Ни на кого не подписан."));
  }

  function showSearch() {
    top.replaceChildren(backHdr("Поиск людей")); msgBar(null);
    const inp = h("input", {class:"srch", type:"search", placeholder:"Имя или @юзернейм", maxlength:30, autocomplete:"off", "aria-label":"Поиск людей"}), res = h("div"); let t, seq = 0;
    res.append(empty("Введи минимум 2 символа."));
    inp.oninput = () => {
      clearTimeout(t); t = setTimeout(async () => {
        const q = inp.value.replace(/^@/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 30), my = ++seq;
        if (q.length < 2) return res.replaceChildren(empty("Введи минимум 2 символа."));
        res.replaceChildren(skel(2));
        const { data, error } = await db.from("forum_profiles").select("id,username,display_name,avatar_path,bio").or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(20);
        if (my !== seq) return; if (error) return res.replaceChildren(empty("Не удалось найти."));
        const set = await mySet((data || []).map(r => r.id)); if (my !== seq) return;
        res.replaceChildren(...((data || []).length ? data.map((r, i) => { const e = personRow(r, set); e.style.setProperty("--i", Math.min(i, 8)); return e; }) : [empty("Никого не нашли.")]));
      }, 300);
    };
    show(h("div", {class:"sbox"}, inp), res); inp.focus();
  }

  async function showNotifs() {
    top.replaceChildren(backHdr("Уведомления")); msgBar(null); show(skel(3));
    if (!fu) return show(empty("Войди, чтобы видеть уведомления."));
    const seen = mine?.notif_seen_at ? new Date(mine.notif_seen_at) : new Date(), { data, error } = await db.rpc("forum_notifications");
    if (error) return show(empty("Не удалось загрузить. Выполнил ли ты forum-v3.sql?"));
    const rows = (data || []).map((n, i) => {
      const pr = {username:n.username, display_name:n.display_name, avatar_path:n.avatar_path}, av = avatar(pr, "avlink");
      const txt = n.kind === "follow" ? " подписался на тебя" : n.kind === "like" ? " оценил твой пост" : " ответил тебе";
      const el = h("div", {class:"tw-row nt" + (new Date(n.ts) > seen ? " new" : ""), onclick:() => n.kind === "follow" ? C.prof(n.username) : C.open({id:n.post_id})}, h("div", {class:"avcol"}, av),
        h("div", {class:"tw-main"}, h("div", {class:"tw-top"}, h("b", {}, nameOf(pr)), h("span", {}, txt), h("span", {class:"meta"}, "· " + ago(n.ts))), n.snippet ? h("div", {class:"tw-txt nsn"}, n.snippet) : null));
      el.style.setProperty("--i", Math.min(i, 8)); av.onclick = e => { e.stopPropagation(); C.prof(n.username); }; return el;
    });
    show(...(rows.length ? rows : [empty("Пока ничего нет. Лайки, ответы и новые подписчики появятся здесь.")]));
    await db.rpc("forum_mark_seen"); if (mine) mine.notif_seen_at = new Date().toISOString();
  }

  const [k, a, b] = String(FPATH || "").split("/");
  if (k === "p" && /^[0-9a-f-]{36}$/i.test(a || "")) view(() => showThread({id:a}));
  else if (k === "u" && /^[a-z0-9_]{3,20}$/.test(a || "")) view(() => b === "followers" || b === "following" ? showPeople(a, b) : showProfile(a));
  else if (k === "n") view(showNotifs);
  else if (k === "s") view(showSearch);
  else { tab = k === "sub" ? "sub" : "all"; showFeed(); }
}

{ const v = document.getElementById("ver"); if (v) v.textContent = "DorsoTic v" + SITE_VERSION; }
