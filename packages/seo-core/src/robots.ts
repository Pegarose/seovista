export interface RobotsRule {
  readonly type: "allow" | "disallow";
  readonly pattern: string;
  readonly line: number;
}

export interface RobotsGroup {
  readonly userAgents: readonly string[];
  readonly rules: readonly RobotsRule[];
  readonly line: number;
}

export interface RobotsTxtDocument {
  readonly groups: readonly RobotsGroup[];
  readonly sitemaps: readonly string[];
  readonly parseErrors: readonly string[];
}

export function parseRobotsTxt(content: string): RobotsTxtDocument {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  const parseErrors: string[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];
  let groupLine = 0;
  let rulesStarted = false;

  const flush = (): void => {
    if (agents.length > 0) {
      groups.push({ userAgents: agents, rules, line: groupLine });
    }
    agents = [];
    rules = [];
    groupLine = 0;
    rulesStarted = false;
  };

  const lines = content.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const hash = rawLine.indexOf("#");
    const text = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim();
    if (!text) return;
    const colon = text.indexOf(":");
    if (colon === -1) {
      parseErrors.push(`Satır ${lineNo}: geçersiz alan`);
      return;
    }
    const field = text.slice(0, colon).trim().toLowerCase();
    const value = text.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (rulesStarted) flush();
      if (agents.length === 0) groupLine = lineNo;
      if (value) agents.push(value.toLowerCase());
      return;
    }
    if (field === "allow" || field === "disallow") {
      if (agents.length === 0) {
        parseErrors.push(`Satır ${lineNo}: user-agent olmadan ${field} kuralı`);
        return;
      }
      rulesStarted = true;
      if (value === "") return; // empty Disallow = allow; empty Allow = no-op
      rules.push({ type: field, pattern: value, line: lineNo });
      return;
    }
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      return;
    }
    // crawl-delay, host, unknown fields: ignored by design
  });
  flush();
  return { groups, sitemaps, parseErrors };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function robotsPatternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regexBody = body
    .split("")
    .map((ch) => (ch === "*" ? ".*" : escapeRegExp(ch)))
    .join("");
  return new RegExp(`^${regexBody}${anchored ? "$" : ""}`).test(path);
}

function matchingGroups(doc: RobotsTxtDocument, userAgent: string): RobotsGroup[] {
  const ua = userAgent.toLowerCase();
  let best = 0;
  for (const group of doc.groups) {
    for (const token of group.userAgents) {
      if (token !== "*" && ua.startsWith(token) && token.length > best) best = token.length;
    }
  }
  if (best > 0) {
    return doc.groups.filter((g) =>
      g.userAgents.some((t) => t !== "*" && t.length === best && ua.startsWith(t)),
    );
  }
  return doc.groups.filter((g) => g.userAgents.includes("*"));
}

export function isPathAllowed(doc: RobotsTxtDocument, userAgent: string, path: string): boolean {
  const rules = matchingGroups(doc, userAgent).flatMap((g) => g.rules);
  const matching = rules.filter((r) => robotsPatternMatches(r.pattern, path));
  if (matching.length === 0) return true;
  const longest = Math.max(...matching.map((r) => r.pattern.length));
  const winners = matching.filter((r) => r.pattern.length === longest);
  return winners.some((r) => r.type === "allow");
}

export type CrawlerAccessStatus = "allowed" | "blocked" | "partial";

export function evaluateCrawlerAccess(doc: RobotsTxtDocument, userAgent: string): CrawlerAccessStatus {
  if (!isPathAllowed(doc, userAgent, "/")) return "blocked";
  const restricted = matchingGroups(doc, userAgent).some((g) =>
    g.rules.some((r) => r.type === "disallow"),
  );
  return restricted ? "partial" : "allowed";
}

export interface RuleConflict {
  readonly description: string;
  readonly lines: string[];
}

const FULL_BLOCK_PATTERNS = new Set(["/", "/*"]);

/**
 * Detects genuine rule contradictions: the same path carrying both an Allow
 * and a Disallow rule inside one group. This is the narrow, penalty-relevant
 * subset of {@link detectRuleConflicts} — the worker's AI-crawler audit uses
 * it directly so it does not duplicate the logic (M1(a) drift fix).
 */
export function detectContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  for (const group of doc.groups) {
    const allows = new Set(group.rules.filter((r) => r.type === "allow").map((r) => r.pattern));
    for (const rule of group.rules) {
      if (rule.type === "disallow" && allows.has(rule.pattern)) {
        conflicts.push({
          description: `Aynı yol için hem Allow hem Disallow kuralı tanımlı: ${rule.pattern}`,
          lines: [`user-agent: ${group.userAgents.join(", ")} (satır ${group.line})`],
        });
      }
    }
  }
  return conflicts;
}

export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
  const conflicts: RuleConflict[] = detectContradictoryRuleConflicts(doc);
  const wildcards = doc.groups.filter((g) => g.userAgents.includes("*"));
  const wildcardFullBlock = wildcards.some((g) =>
    g.rules.some((r) => r.type === "disallow" && FULL_BLOCK_PATTERNS.has(r.pattern)),
  );
  if (wildcards.length > 0 && !wildcardFullBlock) {
    for (const group of doc.groups) {
      if (group.userAgents.includes("*")) continue;
      const fullBlock = group.rules.some(
        (r) => r.type === "disallow" && FULL_BLOCK_PATTERNS.has(r.pattern),
      );
      if (fullBlock) {
        conflicts.push({
          description: `${group.userAgents.join(", ")} için tüm site engellenmiş ancak genel (*) grubu izin veriyor — kasıtlı bir politika değilse çakışmadır`,
          lines: [`satır ${group.line}`],
        });
      }
    }
  }
  return conflicts;
}
