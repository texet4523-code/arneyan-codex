/**
 * Descriptions as the sheet shows them. The books print a feature as a bulleted "Effect:" line, which on a sheet read
 * as a lone bullet with a label (Jacob's Well, 8 Nov: "formatted weird"). The first "Effect:" bullet becomes a plain
 * paragraph; any bullets after it (Arrow Repertoire's arrows, "From 3rd level: ...") stay a list.
 */
export function tidyDescription(html) {
  const s = String(html ?? "");
  const m = s.match(/^(\s*)<ul>\s*<li>\s*<strong>\s*Effect:?\s*<\/strong>:?\s*([\s\S]*?)<\/li>([\s\S]*?)<\/ul>([\s\S]*)$/i);
  if (!m) return s;
  const [, lead, first, rest, tail] = m;
  // Only when the list closes where we think it does (no nested list in the first bullet).
  if (/<ul>|<li>/i.test(first)) return s;
  return `${lead}<p>${first.trim()}</p>${/<li>/i.test(rest) ? `<ul>${rest}</ul>` : ""}${tail}`;
}
