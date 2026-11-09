/**
 * Descriptions as the sheet shows them. The books print a feature as a bulleted "Effect:" line, which on a sheet read
 * as a lone bullet with a label (Jacob's Well, 8 Nov: "formatted weird"). The first "Effect:" bullet becomes a plain
 * paragraph; any bullets after it (Arrow Repertoire's arrows, "From 3rd level: ...") stay a list.
 */
export function tidyDescription(html) {
  return rollableDice(tidyEffect(html));
}

/**
 * Dice written in the text ("asleep for 1d4 rounds") become rollable: a click rolls them in chat (Jacob's Well, 8 Nov:
 * "no d4 roll button"). Only in the words, never inside a tag, an inline roll or an @-link.
 */
export function rollableDice(html) {
  const s = String(html ?? "");
  if (!/\d*d\d/i.test(s)) return s;
  let inLink = 0;
  return s.split(/(<[^>]*>|\[\[[^\]]*\]\]|@\w+\[[^\]]*\](?:\{[^}]*\})?)/).map((part, i) => {
    if (i % 2 === 1) {
      if (/^<a\b/i.test(part)) inLink++;
      else if (/^<\/a>/i.test(part)) inLink = Math.max(0, inLink - 1);
      return part;
    }
    if (inLink) return part;
    return part.replace(/(^|[^\w@\[])(\d*d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+(?!\s*(?:ft|feet|%)))?)(?![\w\]])/gi,
      (m, pre, f) => `${pre}[[/r ${f.replace(/\s+/g, "")}]]{${f}}`);
  }).join("");
}

function tidyEffect(html) {
  const s = String(html ?? "");
  const m = s.match(/^(\s*)<ul>\s*<li>\s*<strong>\s*Effect:?\s*<\/strong>:?\s*([\s\S]*?)<\/li>([\s\S]*?)<\/ul>([\s\S]*)$/i);
  if (!m) return s;
  const [, lead, first, rest, tail] = m;
  // Only when the list closes where we think it does (no nested list in the first bullet).
  if (/<ul>|<li>/i.test(first)) return s;
  return `${lead}<p>${first.trim()}</p>${/<li>/i.test(rest) ? `<ul>${rest}</ul>` : ""}${tail}`;
}
