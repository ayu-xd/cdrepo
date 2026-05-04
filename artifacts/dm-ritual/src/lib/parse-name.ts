export function normalizeUnicodeText(e: string): string {
  const specials = Object.entries({
    L: /ł/gim,
    O: /ø/gim,
    AE: /æ/gim,
    SS: /ß/gim,
  } as Record<string, RegExp>);
  e = e.normalize("NFKD");
  for (const [pattern, repl] of [
    [/[\u0300-\u036F]/g, ""],
    [/[\u180E\u200B-\u200D\u2060\uFEFF]/g, ""],
    [/[\u2420\u2422\u2423]/g, " "],
    [/[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " "],
    [/\s+/g, " "],
  ] as [RegExp, string][]) {
    e = e.replace(pattern, repl);
  }
  for (const [a, r] of specials) {
    e = e.replace(r as RegExp, (ch: string) =>
      ch === ch.toUpperCase() ? a : a.toLowerCase()
    );
  }
  return e;
}

export interface ParsedName {
  title: string; first: string; middle: string;
  last: string; nick: string; suffix: string; error: string[];
}

export function parseFullName(e: string, t = "all"): ParsedName | string {
  let n: number, o: number, c: number, d: number,
    l: string, h: string | null, u: string[], g: string[], m: string[], p: string, y: number, f: number, w: number;
  let _: string[] = [], T: (string | null)[] = [null], I: string[] = [];
  const E = ["&", "and", "et", "e", "of", "the", "und", "y"];
  let C: ParsedName = { title: "", first: "", middle: "", last: "", nick: "", suffix: "", error: [] };

  function b(msg: string) { C.error.push("Error: " + msg); }

  t = ["title","first","middle","last","nick","suffix","error"].includes(t.toLowerCase()) ? t.toLowerCase() : "all";

  if (e && typeof e === "string") {
    e = e.trim();

    g = [
      "esq","esquire","jr","jnr","sr","snr","2","ii","iii","iv","v","clu","chfc","cfp",
      "md","phd","j.d.","ll.m.","m.d.","d.o.","d.c.","p.c.","ph.d.",
      "dnp","d.n.p.","aprn","crna","np","np-c","fnp","fnp-c","fnp-bc",
      "anp","anp-bc","agpcnp","pmhnp","acnp","cpnp","whnp","crnp",
      "pa","pa-c","rn","bsn","msn","lmt","lac","lcsw","lpc","psyd","psy.d.",
    ];
    m = [
      "a","ab","antune","ap","abu","al","alm","alt","bab","bäck","bar","bath","bat",
      "beau","beck","ben","berg","bet","bin","bint","birch","björk","björn","bjur",
      "da","dahl","dal","de","degli","dele","del","della","der","di","dos","du","e",
      "ek","el","escob","esch","fleisch","fitz","fors","gott","griff","haj","haug",
      "holm","ibn","kauf","kil","koop","kvarn","la","le","lind","lönn","lund","mac",
      "mhic","mic","mir","na","naka","neder","nic","ni","nin","nord","norr","ny","o",
      "ua","ui'","öfver","ost","över","öz","papa","pour","quarn","skog","skoog","sten",
      "stor","ström","söder","ter","tre","türk","van","väst","väster","vest","von",
    ];
    u = [
      "mr","mrs","ms","miss","dr","herr","monsieur","hr","frau","admiraal","admiral",
      "a v m","air cdre","air commodore","air marshal","air vice marshal","alderman",
      "alhaji","ambassador","baron","barones","brig","brig gen","brig general",
      "brigadier","brigadier general","brother","canon","capt","captain","cardinal",
      "cdr","chief","cik","cmdr","coach","col","col dr","colonel","commandant",
      "commander","commissioner","commodore","comte","comtessa","congressman",
      "conseiller","consul","conte","contessa","corporal","councillor","count",
      "countess","crown prince","crown princess","dame","datin","dato","datuk",
      "datuk seri","deacon","deaconess","dean","dhr","dipl ing","doctor","dott",
      "dott sa","dr","dr ing","dra","drs","embajador","embajadora","en","encik",
      "eng","eur ing","exma sra","exmo sr","f o","father","first lieutient",
      "first officer","flt lieut","flying officer","fr","frau","fraulein","fru",
      "gen","general","governor","graaf","gravin","group captain","grp capt",
      "h e dr","h h","h m","h r h","hajah","haji","hajim","her highness",
      "her majesty","high warden","his highness","his holiness","his majesty",
      "hon","hra","ing","ir","jonkheer","judge","justice","khun ying","kolonel",
      "lady","lcda","lic","lord","lt","lt col","lt gen","major","master","mevrouw",
      "mme","mn","monsignor","mstr","nti","pastor","president","princess",
      "princesse","prinses","prof","professor","prop","rabbi","rear admiral",
      "rev","reverend","right reverend","senator","sergeant","sheikh","sherif",
      "shri","sir","sister","sqn ldr","sr","sra","srta","sultan","supt","sur",
      "tan sri dato","tan sri","tengku","the hon","the reverend","tun dato","tun",
      "ven","vice admiral","viscount","viscountessa","wg cdr","yr",
    ];

    // strip nicknames
    I = [];
    y = 0;
    e = e.replace(/\s*\(([^)]+)\)\s*/g, (_, n) => { I.push(n); y++; return " "; });
    e = e.replace(/\s*"([^"]+)"\s*/g, (_, n) => { I.push(n); y++; return " "; });
    e = e.trim();
    if (y === 1) { C.nick = I[0]; I = []; }
    else if (y > 1) { b(y + " nicknames found"); C.nick = I.join(", "); I = []; }

    if (e.trim().length) {
      _ = []; T = [null]; I = [];
      for (const word of e.split(" ")) {
        l = word; h = null;
        if (l.slice(-1) === ",") { h = ","; l = l.slice(0, -1); }
        _.push(l); T.push(h);
      }
      // strip suffixes
      c = _.length;
      for (n = c - 1; n > 0; n--) {
        p = (_[n].slice(-1) === "." ? _[n].slice(0, -1) : _[n]).toLowerCase();
        if (g.indexOf(p) > -1 || g.indexOf(p + ".") > -1) {
          I = _.splice(n, 1).concat(I);
          if (T[n] === ",") T.splice(n + 1, 1); else T.splice(n, 1);
        }
      }
      y = I.length;
      if (y === 1) { C.suffix = I[0]; I = []; }
      else if (y > 1) { b(y + " suffixes found"); C.suffix = I.join(", "); I = []; }

      if (_.length) {
        // strip titles
        c = _.length; I = [];
        for (n = c - 1; n >= 0; n--) {
          p = (_[n].slice(-1) === "." ? _[n].slice(0, -1) : _[n]).toLowerCase();
          if (u.indexOf(p) > -1 || u.indexOf(p + ".") > -1) {
            I = _.splice(n, 1).concat(I);
            if (T[n] === ",") T.splice(n + 1, 1); else T.splice(n, 1);
          }
        }
        y = I.length;
        if (y === 1) { C.title = I[0]; I = []; }
        else if (y > 1) { b(y + " titles found"); C.title = I.join(", "); I = []; }

        if (_.length) {
          // compound last name particles
          if (_.length > 1)
            for (n = _.length - 2; n >= 0; n--)
              if (m.indexOf(_[n].toLowerCase()) > -1) {
                _[n] = _[n] + " " + _[n + 1]; _.splice(n + 1, 1); T.splice(n + 1, 1);
              }
          // conjunctions
          if (_.length > 2)
            for (n = _.length - 3; n >= 0; n--)
              if (E.indexOf(_[n + 1].toLowerCase()) > -1) {
                _[n] = _[n] + " " + _[n + 1] + " " + _[n + 2];
                _.splice(n + 1, 2); T.splice(n + 1, 2); n--;
              }
          T.pop();
          f = T.indexOf(",");
          w = T.filter(x => x !== null).length;
          if (f > 1 || w > 1)
            for (n = _.length - 1; n >= 2 && T[n] === ","; n--) {
              I = _.splice(n, 1).concat(I); T.splice(n, 1); w--;
            }
          if (I.length) { if (C.suffix) I = [C.suffix].concat(I); C.suffix = I.join(", "); I = []; }
          if (w > 0) {
            if (w > 1) b(w - 1 + " extra commas found");
            const commaPos = T.indexOf(",");
            if (commaPos) { C.last = _.splice(0, commaPos).join(" "); T.splice(0, commaPos); }
          } else { C.last = _.pop() || ""; }
          if (_.length) { C.first = _.shift() || ""; if (_.length) C.middle = _.join(" "); }
        }
      }
    }
  } else { b("No input"); }

  return t === "all" ? C : (C as any)[t] ?? "";
}

export function stripEmojis(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/\u200D/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveFirstName(rawFullName: string | null, _username: string | null): string {
  // 1. Normalize fancy Unicode folds (math bold/italic/script → ASCII) + strip emojis
  let name = (rawFullName || "").split("|")[0].trim();
  name = stripEmojis(normalizeUnicodeText(name)).trim();

  // 2. No name at all → return "" so caller removes {{firstName}} from opener
  if (!name) return "";

  let firstName: string;
  if (name.includes(" ")) {
    const parsed = parseFullName(name, "all") as ParsedName;
    // Fall back to last when first is empty — happens when a single word
    // remains after stripping credentials/titles (e.g. "Jess, NP", "Dr. Rhea")
    firstName = parsed.first || parsed.last || "";
  } else {
    firstName = name;
  }

  // 3. Final cleanup: strip any remaining emojis, normalize again
  firstName = stripEmojis(normalizeUnicodeText(firstName)).trim();

  // 4. ALL CAPS → Title case  (e.g. "SARAH" → "Sarah")
  if (firstName.length > 1 && firstName === firstName.toUpperCase()) {
    firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }

  return firstName;
}
