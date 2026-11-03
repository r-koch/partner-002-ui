/* PARTNER-002 draft palette switcher — shared by all design-draft pages.
   Adds a top bar with a palette dropdown + custom palette adder. No emojis. */
(function () {
  var PALETTES = {
    "A Warm Stylized": { bg:"#FAF6EF", surface:"#F3EBDD", text:"#2E2620", muted:"#6B5D50", accent:"#B0431F", accentText:"#FFFFFF", line:"#D8CCBA", exclude:"#A63A2B", match:"#3E6B4F", positive:"#3E6B4F" },
    "B Calm Minimal":  { bg:"#F7F8FA", surface:"#FFFFFF", text:"#1E2430", muted:"#5A6574", accent:"#2E6FDB", accentText:"#FFFFFF", line:"#D9DEE8", exclude:"#B3403A", match:"#2F7D5B", positive:"#2F7D5B" },
    "C Deep Trust":    { bg:"#191C22", surface:"#232830", text:"#EDEFF2", muted:"#A7AEB8", accent:"#D9A05B", accentText:"#191C22", line:"#343B45", exclude:"#D96A5B", match:"#7FB69A", positive:"#7FB69A" },
    "D Forest Calm":   { bg:"#F2F6F1", surface:"#E7EDE4", text:"#1F2B20", muted:"#566556", accent:"#3F7D54", accentText:"#FFFFFF", line:"#D3DCD0", exclude:"#B3403A", match:"#2F7D5B", positive:"#2F7D5B" },
    "E Ocean Breeze":  { bg:"#F0F5F8", surface:"#E3ECF2", text:"#1B2733", muted:"#4F6473", accent:"#1F7A8C", accentText:"#FFFFFF", line:"#CFDCE4", exclude:"#B3403A", match:"#228C60", positive:"#228C60" },
    "F Lavender":      { bg:"#F7F4FA", surface:"#ECE7F3", text:"#241F2E", muted:"#5E5470", accent:"#6D4FA8", accentText:"#FFFFFF", line:"#DAD2E4", exclude:"#B3403A", match:"#2F7D5B", positive:"#5E7D4F" },
    "G Sage":          { bg:"#F5F3EC", surface:"#EAE6D9", text:"#29251B", muted:"#68604E", accent:"#5F7A61", accentText:"#FFFFFF", line:"#D8D4C4", exclude:"#B3403A", match:"#4E7A3F", positive:"#4E7A3F" },
    "H Midnight Navy": { bg:"#141824", surface:"#1E2433", text:"#EDF0F6", muted:"#9AA5B8", accent:"#5B8DEF", accentText:"#141824", line:"#2C3447", exclude:"#D96A5B", match:"#66B08A", positive:"#5B8DEF" },
    "I Olive":         { bg:"#F3F4EC", surface:"#E8EADB", text:"#23261B", muted:"#5D6250", accent:"#6B7A2F", accentText:"#FFFFFF", line:"#D2D6C2", exclude:"#B3403A", match:"#4E7A3F", positive:"#5A6B2C" },
    "J Plum":          { bg:"#FAF3F1", surface:"#F1E7E3", text:"#2C1F1D", muted:"#6E5A55", accent:"#8A4B6E", accentText:"#FFFFFF", line:"#E1D3CD", exclude:"#B3403A", match:"#2F7D5B", positive:"#6E4B72" }
  };
  var STORE = "partner002-draft-palette";
  var CUSTOM = "partner002-custom-palettes";

  function apply(name) {
    var p = PALETTES[name];
    if (!p) return;
    function lum(hex) {
      var h = hex.replace("#",""); var r=parseInt(h.slice(0,2),16)/255, g=parseInt(h.slice(2,4),16)/255, b=parseInt(h.slice(4,6),16)/255;
      function f(c){return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);}
      return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
    }
    function ink(bg){ return lum(bg) > 0.42 ? "#17130F" : "#FFFFFF"; } // light bg -> dark ink, dark bg -> white
    var r = document.documentElement.style;
    r.setProperty("--bg", p.bg); r.setProperty("--surface", p.surface);
    r.setProperty("--text", p.text); r.setProperty("--muted", p.muted);
    r.setProperty("--accent", p.accent); r.setProperty("--accent-text", p.accentText || ink(p.accent));
    r.setProperty("--line", p.line); r.setProperty("--exclude", p.exclude);
    r.setProperty("--exclude-text", p.excludeText || ink(p.exclude));
    r.setProperty("--match", p.match); r.setProperty("--positive", p.positive);
    r.setProperty("--positive-text", p.positiveText || ink(p.positive));
    try { localStorage.setItem(STORE, name); } catch (e) {}
    var sel = document.getElementById("palette-select");
    if (sel) sel.value = name;
  }

  function loadCustom() {
    try {
      var raw = localStorage.getItem(CUSTOM);
      if (!raw) return;
      var list = JSON.parse(raw);
      list.forEach(function (name) {
        if (!PALETTES[name]) {
          PALETTES[name] = { bg:"#FAF6EF", surface:"#F3EBDD", text:"#2E2620", muted:"#6B5D50", accent:"#B0431F", accentText:"#FFFFFF", line:"#D8CCBA", exclude:"#A63A2B", match:"#3E6B4F", positive:"#3E6B4F" };
        }
      });
    } catch (e) {}
  }
  function saveCustom() {
    var names = Object.keys(PALETTES).filter(function (n) {
      return n.indexOf("CUSTOM") === 0;
    });
    try { localStorage.setItem(CUSTOM, JSON.stringify(names)); } catch (e) {}
  }

  function buildBar() {
    var bar = document.createElement("div");
    bar.id = "palette-bar";
    bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999;display:flex;align-items:center;gap:10px;" +
      "padding:10px 14px;background:var(--surface, #F3EBDD);border-bottom:1px solid var(--line,#D8CCBA);" +
      "font-family:Georgia,serif;font-size:14px;color:var(--text,#2E2620);flex-wrap:wrap;box-shadow:0 1px 4px rgba(0,0,0,.08);";
    var lab = document.createElement("span");
    lab.textContent = "Palette";
    var sel = document.createElement("select");
    sel.id = "palette-select";
    Object.keys(PALETTES).forEach(function (n) {
      var o = document.createElement("option");
      o.value = n; o.textContent = n; sel.appendChild(o);
    });
    sel.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid var(--line,#D8CCBA);background:var(--bg,#FAF6EF);color:var(--text,#2E2620);font-family:inherit;";
    sel.addEventListener("change", function () { apply(sel.value); });

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.id = "palette-add-btn";
    addBtn.textContent = "+ Add custom";
    addBtn.style.cssText = "padding:6px 12px;border-radius:999px;border:1px solid var(--line,#D8CCBA);background:none;color:var(--text,#2E2620);cursor:pointer;font-family:inherit;font-size:13px;";

    var form = document.createElement("div");
    form.id = "palette-form";
    form.style.cssText = "display:none;width:100%;gap:8px;flex-wrap:wrap;align-items:center;padding-top:4px;";
    var fields = ["bg","surface","text","muted","accent","accentText","line","exclude","match","positive"];
    var inputs = {};
    fields.forEach(function (k) {
      var lab2 = document.createElement("label");
      lab2.textContent = k + " ";
      lab2.style.cssText = "font-size:12px;display:flex;align-items:center;gap:4px;";
      var inp = document.createElement("input");
      inp.type = "color"; inp.value = PALETTES["A Warm Stylized"][k];
      inp.style.cssText = "width:28px;height:28px;border:none;padding:0;background:none;";
      inputs[k] = inp; lab2.appendChild(inp); form.appendChild(lab2);
    });
    var nameInp = document.createElement("input");
    nameInp.type = "text"; nameInp.placeholder = "custom name";
    nameInp.style.cssText = "padding:5px 8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--text);font-family:inherit;font-size:13px;";
    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save & apply";
    saveBtn.style.cssText = "padding:6px 12px;border-radius:999px;background:var(--positive,#3E6B4F);color:#fff;border:none;cursor:pointer;font-family:inherit;font-size:13px;";
    saveBtn.addEventListener("click", function () {
      var nm = (nameInp.value || "CUSTOM " + (Object.keys(PALETTES).length + 1)).trim();
      var p = {};
      fields.forEach(function (k) { p[k] = inputs[k].value; });
      PALETTES[nm] = p;
      var o = document.createElement("option");
      o.value = nm; o.textContent = nm; sel.appendChild(o);
      saveCustom(); apply(nm);
      form.style.display = "none";
    });
    addBtn.addEventListener("click", function () {
      form.style.display = form.style.display === "none" ? "flex" : "none";
    });
    form.appendChild(nameInp); form.appendChild(saveBtn);

    bar.appendChild(lab); bar.appendChild(sel); bar.appendChild(addBtn); bar.appendChild(form);
    document.body.insertBefore(bar, document.body.firstChild);

    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) {}
    apply(saved && PALETTES[saved] ? saved : "A Warm Stylized");
  }

  loadCustom(); buildBar();
    document.body.style.paddingTop = "56px";   // bar is fixed; keep content clear of it
  })();