/* SpekGadget Arena - API lokal.
   Aplikasi aslinya memakai Express (server.js). Versi statis ini menjawab
   semua endpoint /api/* di perangkat, dari data.js, agar seluruh fitur tetap
   berjalan tanpa server dan tetap tersedia saat offline. */
(function () {
  "use strict";
  var D = window.__SPEK_DATA__ || { PHONES: [], NEWS: [], AFF: {}, ADS: {} };
  var PHONES = D.PHONES || [];
  var NEWS = D.NEWS || [];
  var AFF = D.AFF || { aktif: false, toko: [], fallback: null };
  var ADS = D.ADS || { aktif: false, client: "", slot: {} };
  var KATS = ["HP", "Tablet", "Laptop", "Jam", "Audio"];
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function json(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
  function galat(status, pesan) { return json({ error: pesan, code: status }, status); }
  function lowest(p) {
    if (!p || !p.prices || !p.prices.length) return 0;
    return Math.min.apply(null, p.prices.map(function (x) { return Number(x.harga) || 0; }));
  }
  function withRating(p) {
    var out = {};
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k];
    out.ratingLive = p.rating;
    out.reviewCountLive = p.reviewCount;
    return out;
  }
  function ringkas(p) {
    var f = withRating(p);
    return {
      id: f.id, name: f.name, brand: f.brand, kategori: f.kategori || "HP", released: f.released,
      launch: { rilis: (f.launch && f.launch.rilis) || f.released },
      rating: f.rating, reviewCount: f.reviewCount,
      ratingLive: f.ratingLive, reviewCountLive: f.reviewCountLive,
      hits: f.hits, antutu: f.antutu,
      colors: f.colors, colorHex: f.colorHex,
      network: { dukungan5G: !!(f.network && f.network.dukungan5G) },
      body: { berat: (f.body && f.body.berat) || "-" },
      display: { ukuran: (f.display && f.display.ukuran) || "-", tipe: (f.display && f.display.tipe) || "-" },
      platform: { chipset: (f.platform && f.platform.chipset) || "-" },
      memory: { ramUtama: f.memory.ramUtama, storageUtama: f.memory.storageUtama },
      battery: { kapasitas: f.battery.kapasitas },
      prices: f.prices, hargaTermurah: lowest(f)
    };
  }
  function cleanSearch(s) { return String(s || "").trim().slice(0, 80); }
  function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function isId(s) { return /^[a-z0-9-]{3,60}$/.test(String(s || "")); }
  function byId(id) {
    for (var i = 0; i < PHONES.length; i++) if (PHONES[i].id === id) return PHONES[i];
    return null;
  }
  function merekList() {
    var map = {};
    PHONES.forEach(function (p) { map[p.brand] = (map[p.brand] || 0) + 1; });
    return Object.keys(map).map(function (brand) { return { brand: brand, count: map[brand] }; })
      .sort(function (a, b) { return a.brand.localeCompare(b.brand); });
  }

  function daftarPhone(u) {
    var q = u.searchParams;
    var out = PHONES.map(withRating);
    var search = cleanSearch(q.get("search"));
    var brand = (q.get("brand") || "").trim().slice(0, 40);
    var minP = q.get("minPrice") ? Number(q.get("minPrice")) : null;
    var maxP = q.get("maxPrice") ? Number(q.get("maxPrice")) : null;
    var ram = q.get("ram") ? Number(q.get("ram")) : null;
    var storage = q.get("storage") ? Number(q.get("storage")) : null;
    if ((minP !== null && (Number.isNaN(minP) || minP < 0 || minP > 999999999)) ||
        (maxP !== null && (Number.isNaN(maxP) || maxP < 0 || maxP > 999999999)))
      return galat(400, "Rentang harga tidak valid.");
    if (minP !== null && maxP !== null && minP > maxP)
      return galat(400, "Harga minimum lebih besar dari maksimum.");
    if ((ram !== null && (Number.isNaN(ram) || ram < 0 || ram > 64)) ||
        (storage !== null && (Number.isNaN(storage) || storage < 0 || storage > 2048)))
      return galat(400, "Filter memori tidak valid.");
    if (brand && brand !== "Semua" && !merekList().some(function (m) { return m.brand === brand; }))
      return galat(400, "Merek tidak dikenal.");
    var kat = (q.get("kategori") || "").trim();
    if (kat && kat !== "Semua" && KATS.indexOf(kat) === -1) return galat(400, "Kategori tidak dikenal.");
    var ringkasMode = q.get("ringkas") === "1" || q.get("ringkas") === "true";
    var only5G = q.get("only5G") === "1" || q.get("only5G") === "true";
    var minBat = q.get("minBattery") ? Number(q.get("minBattery")) : null;
    var onlyNFC = q.get("onlyNFC") === "1" || q.get("onlyNFC") === "true";
    var onlyWireless = q.get("onlyWireless") === "1" || q.get("onlyWireless") === "true";
    var sort = q.get("sort") || "populer";
    var peringkat = null;
    if (search) {
      var re = new RegExp(escapeReg(search), "i");
      var ql = search.toLowerCase();
      out = out.filter(function (p) {
        return re.test(p.name) || re.test(p.brand) || re.test(p.platform.chipset);
      });
      var skor = function (p) {
        var nama = String(p.name).toLowerCase(), merek = String(p.brand).toLowerCase();
        var chip = String(p.platform.chipset).toLowerCase();
        if (nama === ql) return 0;
        if (nama.indexOf(ql) === 0) return 1;
        if (nama.split(/[\s-]+/).some(function (w) { return w.indexOf(ql) === 0; })) return 2;
        if (merek === ql || merek.indexOf(ql) === 0) return 3;
        if (chip.indexOf(ql) !== -1) return 4;
        return 5;
      };
      peringkat = {};
      out.forEach(function (p) { peringkat[p.id] = skor(p); });
    }
    if (brand && brand !== "Semua") out = out.filter(function (p) { return p.brand === brand; });
    if (kat && kat !== "Semua") out = out.filter(function (p) { return (p.kategori || "HP") === kat; });
    if (minP !== null) out = out.filter(function (p) { return lowest(p) >= minP; });
    if (maxP !== null) out = out.filter(function (p) { return lowest(p) <= maxP; });
    if (ram) out = out.filter(function (p) { return p.memory.ramUtama >= ram; });
    if (storage) out = out.filter(function (p) { return p.memory.storageUtama >= storage; });
    if (only5G) out = out.filter(function (p) { return p.network.dukungan5G; });
    if (minBat !== null && !Number.isNaN(minBat) && minBat > 0)
      out = out.filter(function (p) { return p.battery.kapasitas >= minBat; });
    if (onlyNFC) out = out.filter(function (p) { return p.comms.nfc; });
    if (onlyWireless) out = out.filter(function (p) { return p.battery.wireless; });
    var sorters = {
      populer: function (a, b) { return b.hits - a.hits; },
      terbaru: function (a, b) { return new Date(b.released) - new Date(a.released); },
      termurah: function (a, b) { return lowest(a) - lowest(b); },
      termahal: function (a, b) { return lowest(b) - lowest(a); },
      nilai: function (a, b) { return (b.antutu / lowest(b)) - (a.antutu / lowest(a)); },
      rating: function (a, b) { return b.ratingLive - a.ratingLive; },
      nama: function (a, b) { return a.name.localeCompare(b.name); }
    };
    var dasar = sorters[sort] || sorters.populer;
    if (peringkat) out.sort(function (a, b) { return (peringkat[a.id] - peringkat[b.id]) || dasar(a, b); });
    else out.sort(dasar);
    var page = Math.max(1, parseInt(q.get("page") || "1", 10) || 1);
    var limit = Math.min(60, Math.max(1, parseInt(q.get("limit") || "9", 10) || 9));
    var total = out.length;
    var pages = Math.max(1, Math.ceil(total / limit));
    var safePage = Math.min(page, pages);
    var slice = out.slice((safePage - 1) * limit, safePage * limit).map(function (p) {
      return ringkasMode ? ringkas(p) : Object.assign({}, p, { hargaTermurah: lowest(p) });
    });
    return json({ data: slice, total: total, page: safePage, pages: pages, limit: limit });
  }

  function detailPhone(id) {
    if (!isId(id)) return galat(400, "ID perangkat tidak valid.");
    var p = byId(id);
    if (!p) return galat(404, "Perangkat tidak ditemukan.");
    return json(Object.assign({}, withRating(p), { hargaTermurah: lowest(p) }));
  }

  function miripPhone(id) {
    if (!isId(id)) return galat(400, "ID perangkat tidak valid.");
    var p = byId(id);
    if (!p) return galat(404, "Perangkat tidak ditemukan.");
    var low = lowest(p), katP = p.kategori || "HP";
    var scored = PHONES.filter(function (x) {
      return x.id !== p.id && (x.kategori || "HP") === katP;
    }).map(function (x) {
      var score = 0;
      if (x.brand === p.brand) score += 3;
      var diff = Math.abs(lowest(x) - low) / (low || 1);
      score += Math.max(0, 3 - diff * 6);
      if (x.network.dukungan5G === p.network.dukungan5G) score += 1;
      if (Math.abs(x.memory.ramUtama - p.memory.ramUtama) <= 4) score += 1;
      return { phone: withRating(x), score: score, hargaTermurah: lowest(x) };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return json(scored.slice(0, 4).map(function (s) {
      return Object.assign({}, s.phone, { hargaTermurah: s.hargaTermurah });
    }));
  }

  function bandingPhone(u) {
    var mentah = (u.searchParams.get("ids") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var ids = mentah.filter(function (id, i) { return mentah.indexOf(id) === i; }).slice(0, 12);
    if (!ids.length) return galat(400, "Pilih minimal 1 perangkat.");
    var result = [], kats = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!isId(id)) return galat(400, "ID tidak valid: " + id);
      var p = byId(id);
      if (!p) return galat(404, "ID tidak valid: " + id);
      result.push(Object.assign({}, withRating(p), { hargaTermurah: lowest(p) }));
      var k = p.kategori || "HP";
      if (kats.indexOf(k) === -1) kats.push(k);
    }
    if (kats.length > 1)
      return galat(400, "Bandingkan produk dalam satu kategori yang sama (" + kats.join(", ") + ").");
    return json(result);
  }

  function beritaList() { return json(NEWS); }
  function beritaSatu(id) {
    var n = null;
    for (var i = 0; i < NEWS.length; i++) if (String(NEWS[i].id) === String(id)) { n = NEWS[i]; break; }
    if (!n) return galat(404, "Berita tidak ditemukan.");
    var terkait = (n.terkait || []).map(byId).filter(Boolean).map(function (p) {
      return Object.assign({}, withRating(p), { hargaTermurah: lowest(p) });
    });
    return json(Object.assign({}, n, { terkait: terkait }));
  }

  var ULASAN_KEY = "spekgadget_ulasan_v1";
  var antre = {};
  function bacaUlasan() {
    try {
      var v = JSON.parse(localStorage.getItem(ULASAN_KEY) || "{}");
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }
  function simpanUlasan(data) {
    try { localStorage.setItem(ULASAN_KEY, JSON.stringify(data)); } catch (e) {}
  }
  function ringkasUlasan(id) {
    var all = bacaUlasan();
    var list = (all[id] || []).slice().reverse();
    var count = list.length;
    var avg = count ? Math.round((list.reduce(function (a, r) { return a + r.rating; }, 0) / count) * 10) / 10 : 0;
    return { avg: avg, count: count, list: list.slice(0, 50) };
  }
  function ulasanGet(id) {
    if (!isId(id)) return galat(400, "ID perangkat tidak valid.");
    if (!byId(id)) return galat(404, "Perangkat tidak ditemukan.");
    return json(ringkasUlasan(id));
  }
  function ulasanPost(id, init) {
    if (!isId(id)) return galat(400, "ID perangkat tidak valid.");
    if (!byId(id)) return galat(404, "Perangkat tidak ditemukan.");
    var body = {};
    try { body = JSON.parse(init && init.body ? init.body : "{}"); } catch (e) { return galat(400, "Format data tidak valid."); }
    var nama = String(body.nama || "").trim().slice(0, 40);
    var komentar = String(body.komentar || "").trim().slice(0, 500);
    var rating = Number(body.rating);
    if (nama.length < 2) return galat(400, "Nama minimal 2 huruf.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return galat(400, "Peringkat harus 1 sampai 5.");
    if (komentar.length < 4) return galat(400, "Komentar minimal 4 huruf.");
    if (/https?:\/\/|www\./i.test(nama + " " + komentar)) return galat(400, "Tautan tidak diizinkan di ulasan.");
    var kini = Date.now();
    antre[id] = (antre[id] || []).filter(function (t) { return kini - t < 10 * 60 * 1000; });
    if (antre[id].length >= 5) return galat(429, "Terlalu sering mengirim. Coba lagi nanti.");
    antre[id].push(kini);
    var all = bacaUlasan();
    if (!all[id]) all[id] = [];
    all[id].push({ nama: nama, rating: rating, komentar: komentar, ts: kini });
    if (all[id].length > 200) all[id] = all[id].slice(-200);
    simpanUlasan(all);
    var hasil = ringkasUlasan(id);
    return json({ ok: true, avg: hasil.avg, count: hasil.count }, 201);
  }

  function stats() {
    var map = {}, perKategori = {};
    PHONES.forEach(function (p) {
      map[p.brand] = (map[p.brand] || 0) + 1;
      var k = p.kategori || "HP";
      perKategori[k] = (perKategori[k] || 0) + 1;
    });
    return json({ ok: true, totalPhones: PHONES.length, totalNews: NEWS.length, totalBrands: Object.keys(map).length, perKategori: perKategori });
  }
  function kategori() {
    var map = {};
    PHONES.forEach(function (p) {
      var k = p.kategori || "HP";
      if (!map[k]) map[k] = { kategori: k, count: 0, minHarga: Infinity };
      map[k].count++;
      var h = lowest(p);
      if (h < map[k].minHarga) map[k].minHarga = h;
    });
    return json(Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return KATS.indexOf(a.kategori) - KATS.indexOf(b.kategori);
    }));
  }

  function handle(u, init) {
    var method = String((init && init.method) || "GET").toUpperCase();
    var path = u.pathname.replace(/\/+$/, "") || "/";
    var seg = path.split("/").filter(Boolean);
    if (seg[0] !== "api") return null;
    if (seg[1] === "health") return json({ ok: true, totalPhones: PHONES.length });
    if (seg[1] === "stats") return stats();
    if (seg[1] === "kategori") return kategori();
    if (seg[1] === "brands") return json(merekList());
    if (seg[1] === "aff") return json(AFF);
    if (seg[1] === "ads") return json(ADS);
    if (seg[1] === "news") {
      if (seg[2] !== undefined) return beritaSatu(decodeURIComponent(seg[2]));
      return beritaList();
    }
    if (seg[1] === "compare") return bandingPhone(u);
    if (seg[1] === "phones") {
      if (seg[2] === undefined) return daftarPhone(u);
      var id = decodeURIComponent(seg[2]);
      if (seg[3] === "similar") return miripPhone(id);
      if (seg[3] === "reviews") return method === "POST" ? ulasanPost(id, init) : ulasanGet(id);
      if (seg[3] === undefined) return detailPhone(id);
    }
    return galat(404, "Endpoint tidak ditemukan.");
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url);
    var u;
    try { u = new URL(url, location.href); } catch (e) { return nativeFetch ? nativeFetch(input, init) : Promise.reject(e); }
    if (u.origin === location.origin && u.pathname.indexOf("/api/") === 0) {
      try {
        var res = handle(u, init);
        if (res) return Promise.resolve(res);
      } catch (e) {
        return Promise.resolve(galat(500, "Terjadi gangguan pada data lokal."));
      }
    }
    return nativeFetch ? nativeFetch(input, init) : Promise.reject(new Error("Fetch tidak tersedia"));
  };
})();
