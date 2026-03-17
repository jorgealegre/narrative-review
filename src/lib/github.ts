import { execSync } from "child_process";
import { PRInfo } from "./types";

function exec(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
}

export function parsePRUrl(url: string): {
  owner: string;
  repo: string;
  number: number;
} {
  const match = url.match(
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  );
  if (!match) {
    throw new Error(`Invalid GitHub PR URL: ${url}`);
  }
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}

export function fetchPRMetadata(
  owner: string,
  repo: string,
  number: number
): PRInfo {
  const json = exec(
    `gh pr view ${number} --repo ${owner}/${repo} --json title,body,author,additions,deletions,changedFiles,baseRefName,headRefName`
  );
  const data = JSON.parse(json);
  return {
    owner,
    repo,
    number,
    title: data.title,
    body: data.body || "",
    author: data.author?.login || "unknown",
    additions: data.additions,
    deletions: data.deletions,
    changedFiles: data.changedFiles,
    baseRef: data.baseRefName,
    headRef: data.headRefName,
  };
}

export function fetchPRDiff(
  owner: string,
  repo: string,
  number: number
): string {
  return exec(`gh pr diff ${number} --repo ${owner}/${repo}`);
}

export function fetchFileContents(
  owner: string,
  repo: string,
  number: number,
  filePaths: string[]
): Record<string, string> {
  const ref = exec(
    `gh pr view ${number} --repo ${owner}/${repo} --json headRefOid --jq .headRefOid`
  ).trim();

  const contents: Record<string, string> = {};
  for (const filePath of filePaths) {
    try {
      const content = exec(
        `gh api repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${ref} --jq .content`
      );
      contents[filePath] = Buffer.from(content.trim(), "base64").toString("utf-8");
    } catch {
      // File may be deleted in this PR, skip
    }
  }
  return contents;
}

export function approvePR(
  owner: string,
  repo: string,
  number: number,
  body: string
): void {
  exec(
    `gh pr review ${number} --repo ${owner}/${repo} --approve --body ${JSON.stringify(body)}`
  );
}

export function requestChangesPR(
  owner: string,
  repo: string,
  number: number,
  body: string
): void {
  exec(
    `gh pr review ${number} --repo ${owner}/${repo} --request-changes --body ${JSON.stringify(body)}`
  );
}
