/**
 * Server-side port of the extension's parseFullName + normalizeUnicodeText.
 * Faithfully mirrors content.js (lines 1475-1554) with medical/med-spa
 * credentials added to the suffix list. Includes emoji stripping and
 * ALL-CAPS → Title Case conversion.
 */

export interface ParsedName {
  title: string;
  first: string;
  middle: string;
  last: string;
  nick: string;
  suffix: string;
  error: string[];
}

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

export function parseFullName(
  e: string,
  t: string = "all",
  s: boolean | number = false,
  a: boolean | number = false,
  r: boolean | number = false
): ParsedName | string {
  let n: number,
    o: number,
    c: number,
    d: number,
    i: string[],
    l: string,
    h: string | null,
    u: string[],
    g: string[],
    m: string[],
    p: string,
    k: unknown,
    y: number,
    f: number,
    w: number;

  let _: string[] = [];
  let T: (string | null)[] = [null];
  let I: string[] = [];
  const E = ["&", "and", "et", "e", "of", "the", "und", "y"];

  let C: ParsedName = {
    title: "",
    first: "",
    middle: "",
    last: "",
    nick: "",
    suffix: "",
    error: [],
  };

  function b(msg: string) {
    if (a) throw "Error: " + msg;
    C.error.push("Error: " + msg);
  }

  function A(obj: ParsedName, fixCase: boolean | number): ParsedName {
    const preserve = [
      "e", "y", "av", "af", "da", "dal", "de", "del", "der", "di",
      "la", "le", "van", "der", "den", "vel", "von",
      "II", "III", "IV", "J.D.", "LL.M.", "M.D.", "D.O.", "D.C.", "Ph.D.",
    ];
    if (fixCase) {
      const fields = (Object.keys(obj) as (keyof ParsedName)[]).filter(
        (k) => k !== "error"
      );
      for (n = 0, c = fields.length; n < c; n++) {
        const fk = fields[n];
        if (obj[fk]) {
          const parts = (obj[fk] as string).split(" ");
          for (o = 0, d = parts.length; o < d; o++) {
            const idx = preserve
              .map((x) => x.toLowerCase())
              .indexOf(parts[o].toLowerCase());
            if (idx > -1) {
              parts[o] = preserve[idx];
            } else if (parts[o].length === 1) {
              parts[o] = parts[o].toUpperCase();
            } else if (
              parts[o].length > 2 &&
              parts[o].slice(0, 1) === parts[o].slice(0, 1).toUpperCase() &&
              parts[o].slice(1, 2) === parts[o].slice(1, 2).toLowerCase() &&
              parts[o].slice(2) === parts[o].slice(2).toUpperCase()
            ) {
              parts[o] = parts[o].slice(0, 3) + parts[o].slice(3).toLowerCase();
            } else if (
              fk !== "suffix" ||
              parts[o].slice(-1) === "." ||
              g.indexOf(parts[o].toLowerCase()) < 0
            ) {
              if (
                parts[o] === parts[o].toLowerCase()
              ) {
                parts[o] = parts[o].toUpperCase();
              } else {
                parts[o] =
                  parts[o].slice(0, 1).toUpperCase() +
                  parts[o].slice(1).toLowerCase();
              }
            } else if (parts[o] === parts[o].toLowerCase()) {
              parts[o] = parts[o].toUpperCase();
            }
          }
          (obj as any)[fk] = parts.join(" ");
        }
      }
    }
    return obj;
  }

  t =
    t &&
    ["title", "first", "middle", "last", "nick", "suffix", "error"].indexOf(
      t.toLowerCase()
    ) > -1
      ? t.toLowerCase()
      : "all";

  s =
    typeof s === "undefined" || (s !== 0 && s !== 1 && s !== false && s !== true)
      ? -1
      : s === true
      ? 1
      : s === false
      ? 0
      : s;

  a = (a === true ? 1 : a) && a === 1 ? 1 : 0;
  r = (r === true ? 1 : r) && r === 1 ? 1 : 0;

  if (e && typeof e === "string") {
    e = e.trim();

    if ((s as number) === -1) {
      s = e === e.toUpperCase() || e === e.toLowerCase() ? 1 : 0;
    }

    if (r) {
      // suffix list — original + medical/med-spa credentials
      g = [
        "esq", "esquire", "jr", "jnr", "sr", "snr",
        "2", "ii", "iii", "iv", "v",
        "clu", "chfc", "cfp",
        // standard medical
        "md", "phd", "j.d.", "ll.m.", "m.d.", "d.o.", "d.c.", "p.c.", "ph.d.",
        // nursing / advanced practice
        "dnp", "d.n.p.", "aprn", "crna",
        "np", "np-c", "fnp", "fnp-c", "fnp-bc",
        "anp", "anp-bc", "agpcnp", "pmhnp", "acnp", "cpnp", "whnp", "crnp",
        // physician associate
        "pa", "pa-c",
        // registered / licensed
        "rn", "bsn", "msn",
        // allied health / aesthetics
        "lmt", "lac",
        "lcsw", "lpc",
        "psyd", "psy.d.",
      ];

      // prefix list (compound last name particles)
      m = [
        "a", "ab", "antune", "ap", "abu", "al", "alm", "alt", "bab", "bäck",
        "bar", "bath", "bat", "beau", "beck", "ben", "berg", "bet", "bin", "bint",
        "birch", "björk", "björn", "bjur", "da", "dahl", "dal", "de", "degli",
        "dele", "del", "della", "der", "di", "dos", "du", "e", "ek", "el",
        "escob", "esch", "fleisch", "fitz", "fors", "gott", "griff", "haj",
        "haug", "holm", "ibn", "kauf", "kil", "koop", "kvarn", "la", "le",
        "lind", "lönn", "lund", "mac", "mhic", "mic", "mir", "na", "naka",
        "neder", "nic", "ni", "nin", "nord", "norr", "ny", "o", "ua", "ui'",
        "öfver", "ost", "över", "öz", "papa", "pour", "quarn", "skog", "skoog",
        "sten", "stor", "ström", "söder", "ter", "ter", "tre", "türk", "van",
        "väst", "väster", "vest", "von",
      ];

      // title list
      u = [
        "mr", "mrs", "ms", "miss", "dr", "herr", "monsieur", "hr", "frau",
        "a v m", "admiraal", "admiral", "air cdre", "air commodore",
        "air marshal", "air vice marshal", "alderman", "alhaji", "ambassador",
        "baron", "barones", "brig", "brig gen", "brig general", "brigadier",
        "brigadier general", "brother", "canon", "capt", "captain", "cardinal",
        "cdr", "chief", "cik", "cmdr", "coach", "col", "col dr", "colonel",
        "commandant", "commander", "commissioner", "commodore", "comte",
        "comtessa", "congressman", "conseiller", "consul", "conte", "contessa",
        "corporal", "councillor", "count", "countess", "crown prince",
        "crown princess", "dame", "datin", "dato", "datuk", "datuk seri",
        "deacon", "deaconess", "dean", "dhr", "dipl ing", "doctor", "dott",
        "dott sa", "dr", "dr ing", "dra", "drs", "embajador", "embajadora",
        "en", "encik", "eng", "eur ing", "exma sra", "exmo sr", "f o",
        "father", "first lieutient", "first officer", "flt lieut",
        "flying officer", "fr", "frau", "fraulein", "fru", "gen",
        "general", "governor", "graaf", "gravin", "group captain", "grp capt",
        "h e dr", "h h", "h m", "h r h", "hajah", "haji", "hajim",
        "her highness", "her majesty", "herr", "high warden", "his highness",
        "his holiness", "his majesty", "hon", "hr", "hra", "ing", "ir",
        "jonkheer", "judge", "justice", "khun ying", "kolonel", "lady",
        "lcda", "lic", "lord", "lt", "lt col", "lt gen",
        "major", "master", "mevrouw", "mme", "mn", "monsignor", "mr",
        "mrs", "ms", "mstr", "nti", "pastor", "president", "princess",
        "princesse", "prinses", "prof", "professor", "prop", "rabbi",
        "rear admiral", "rev", "reverend", "right reverend", "senator",
        "sergeant", "sheikh", "sherif", "shri", "sir", "sister",
        "sqn ldr", "sr", "sra", "srta", "sultan", "supt", "sur",
        "tan sri dato", "tan sri", "tengku", "the hon", "the reverend",
        "tun dato", "tun", "ven", "vice admiral", "viscount",
        "viscountessa", "wg cdr", "yr",
      ];
    } else {
      g = [];
      m = [];
      u = [];
    }

    // strip nicknames in quotes/parens
    const nicknamePatterns = [/\s*\(([^)]+)\)\s*/g, /\s*"([^"]+)"\s*/g];
    y = 0;
    I = [];
    for (const pat of nicknamePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pat.exec(e)) !== null) {
        I.push(match[1]);
        y++;
      }
    }
    for (const nm of I) {
      e = e.replace(/\s*\([^)]+\)\s*/g, " ").replace(/\s*"[^"]+"\s*/g, " ").trim();
    }
    if (y === 1) {
      C.nick = I[0];
      I = [];
    } else if (y > 1) {
      b(y + " nicknames found");
      C.nick = I.join(", ");
      I = [];
    }

    if (e.trim().length) {
      _ = [];
      T = [null];

      for (const word of e.split(" ")) {
        l = word;
        h = null;
        if (l.slice(-1) === ",") {
          h = ",";
          l = l.slice(0, -1);
        }
        _.push(l);
        T.push(h);
      }

      // strip suffixes from end
      c = _.length;
      for (n = c - 1; n > 0; n--) {
        p = (_[n].slice(-1) === "." ? _[n].slice(0, -1) : _[n]).toLowerCase();
        if (g.indexOf(p) > -1 || g.indexOf(p + ".") > -1) {
          I = _.splice(n, 1).concat(I);
          if (T[n] === ",") T.splice(n + 1, 1);
          else T.splice(n, 1);
        }
      }

      y = I.length;
      if (y === 1) {
        C.suffix = I[0];
        I = [];
      } else if (y > 1) {
        b(y + " suffixes found");
        C.suffix = I.join(", ");
        I = [];
      }

      if (_.length) {
        // strip titles from start
        c = _.length;
        for (n = c - 1; n >= 0; n--) {
          p = (_[n].slice(-1) === "." ? _[n].slice(0, -1) : _[n]).toLowerCase();
          if (u.indexOf(p) > -1 || u.indexOf(p + ".") > -1) {
            I = _.splice(n, 1).concat(I);
            if (T[n] === ",") T.splice(n + 1, 1);
            else T.splice(n, 1);
          }
        }

        y = I.length;
        if (y === 1) {
          C.title = I[0];
          I = [];
        } else if (y > 1) {
          b(y + " titles found");
          C.title = I.join(", ");
          I = [];
        }

        if (_.length) {
          // combine compound last name prefixes
          if (_.length > 1) {
            for (n = _.length - 2; n >= 0; n--) {
              if (m.indexOf(_[n].toLowerCase()) > -1) {
                _[n] = _[n] + " " + _[n + 1];
                _.splice(n + 1, 1);
                T.splice(n + 1, 1);
              }
            }
          }

          // combine conjunctions
          if (_.length > 2) {
            for (n = _.length - 3; n >= 0; n--) {
              if (E.indexOf(_[n + 1].toLowerCase()) > -1) {
                _[n] = _[n] + " " + _[n + 1] + " " + _[n + 2];
                _.splice(n + 1, 2);
                T.splice(n + 1, 2);
                n--;
              }
            }
          }

          T.pop();
          f = T.indexOf(",");
          w = T.filter((x) => x !== null).length;

          // handle extra commas
          if (f > 1 || w > 1) {
            for (n = _.length - 1; n >= 2 && T[n] === ","; n--) {
              I = _.splice(n, 1).concat(I);
              T.splice(n, 1);
              w--;
            }
          }

          if (I.length) {
            if (C.suffix) I = [C.suffix].concat(I);
            C.suffix = I.join(", ");
            I = [];
          }

          if (w > 0) {
            if (w > 1) b(w - 1 + " extra commas found");
            const commaPos = T.indexOf(",");
            if (commaPos) {
              C.last = _.splice(0, commaPos).join(" ");
              T.splice(0, commaPos);
            }
          } else {
            C.last = _.pop() || "";
          }

          if (_.length) {
            C.first = _.shift() || "";
            if (_.length) {
              if (_.length > 2) b(_.length + " middle names");
              C.middle = _.join(" ");
            }
          }

          C = A(C, s);
        } else {
          C = A(C, s);
        }
      } else {
        C = A(C, s);
      }
    } else {
      C = A(C, s);
    }
  } else {
    b("No input");
    C = A(C, s);
  }

  return t === "all" ? C : (C as any)[t] ?? "";
}

function stripEmojis(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/\u200D/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves {{firstName}} from scraped full_name.
 * - Strips emojis (✨ 💉 etc.) from input and output
 * - Normalizes fancy Unicode folds (𝐁𝐨𝐥𝐝, 𝒮𝒸𝓇𝒾𝓅𝓉 → ASCII) via NFKD
 * - Converts ALL CAPS names to Title Case
 * - Returns "" when no name available — caller should remove {{firstName}} from opener
 * - Strips medical/med-spa credentials (APRN, DNP, FNP-C, PA-C …) via parseFullName suffix list
 */
export function resolveFirstName(
  rawFullName: string | null,
  _username: string | null
): string {
  // 1. Normalize fancy Unicode folds + strip emojis from raw input
  let name = (rawFullName || "").split("|")[0].trim();
  name = stripEmojis(normalizeUnicodeText(name)).trim();

  // 2. No usable name → return "" so applyVariables can remove the token cleanly
  if (!name) return "";

  let firstName: string;
  if (name.includes(" ")) {
    const parsed = parseFullName(name, "all", false, false, true) as ParsedName;
    // Fall back to last when first is empty — happens when a single word
    // remains after stripping credentials/titles (e.g. "Jess, NP", "Dr. Rhea")
    firstName = parsed.first || parsed.last || "";
  } else {
    firstName = name;
  }

  // 3. Final cleanup pass
  firstName = stripEmojis(normalizeUnicodeText(firstName)).trim();

  // 4. ALL CAPS → Title Case  (e.g. "SARAH" → "Sarah", "MARIA" → "Maria")
  if (firstName.length > 1 && firstName === firstName.toUpperCase()) {
    firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }

  return firstName;
}
