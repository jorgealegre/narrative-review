import * as github from "@actions/github";
import type { PRInfo, PRComment } from "../src/lib/types";

type Octokit = ReturnType<typeof github.getOctokit>;

export async function fetchPRMetadata(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number
): Promise<PRInfo> {
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });

  return {
    owner,
    repo,
    number,
    title: pr.title,
    body: pr.body || "",
    author: pr.user?.login || "",
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
  };
}

export async function fetchPRDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number
): Promise<string> {
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
    mediaType: { format: "diff" },
  });
  // When requesting diff format, data is returned as a string
  return data as unknown as string;
}

export async function fetchPRComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number
): Promise<PRComment[]> {
  const comments: PRComment[] = [];
  const iterator = octokit.paginate.iterator(octokit.rest.pulls.listReviewComments, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });

  for await (const { data } of iterator) {
    for (const c of data) {
      comments.push({
        id: c.id,
        author: c.user?.login || "",
        body: c.body,
        path: c.path,
        line: c.line ?? c.original_line ?? null,
        side: (c.side as "LEFT" | "RIGHT") || "RIGHT",
        createdAt: c.created_at,
        htmlUrl: c.html_url,
      });
    }
  }

  return comments;
}

export async function fetchFileContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  filePaths: string[]
): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};
  const batchSize = 5;

  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (filePath) => {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref,
        });
        if (!Array.isArray(data) && data.type === "file" && data.content) {
          contents[filePath] = Buffer.from(data.content, "base64").toString("utf-8");
        }
      })
    );
    for (const r of results) {
      if (r.status === "rejected") {
        // File may be deleted in this PR
      }
    }
  }

  return contents;
}

const DESCRIPTION_MARKER_START = "<!-- NARRATIVE_REVIEW -->";
const DESCRIPTION_MARKER_END = "<!-- /NARRATIVE_REVIEW -->";

export async function updatePRDescriptionWithNote(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  chapterCount: number,
  fileCount: number,
  reviewUrl?: string,
  artifactUrl?: string
): Promise<void> {
  let link: string;
  if (reviewUrl) {
    link = `**[View Narrative Review →](${reviewUrl})**`;
  } else if (artifactUrl) {
    link = `**[Download the review](${artifactUrl})** — check the Artifacts section`;
  } else {
    link = "Check the workflow run artifacts for the review HTML.";
  }

  const shortSha = headSha.slice(0, 7);
  const actionRepo = process.env.GITHUB_ACTION_REPOSITORY || "jorgealegre/narrative-review";
  const actionUrl = `https://github.com/${actionRepo}`;

  const noteBlock = `${DESCRIPTION_MARKER_START}

---

> [!TIP]
> 📖 **Narrative Review** — ${chapterCount} chapters across ${fileCount} files. ${link}
>
> <sup>Written by [Narrative Review](${actionUrl}) for commit \`${shortSha}\`. This will update automatically on new commits.</sup>

${DESCRIPTION_MARKER_END}`;

  // Fetch current body right before update to minimize stale-body race window
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
  const currentBody = pr.body || "";

  // Strip existing block (greedy match from first START to last END to handle orphaned markers)
  const markerRegex = new RegExp(
    `\\s*${escapeRegex(DESCRIPTION_MARKER_START)}[\\s\\S]*${escapeRegex(DESCRIPTION_MARKER_END)}`
  );
  const strippedBody = currentBody.replace(markerRegex, "").trimEnd();
  const newBody = strippedBody ? `${strippedBody}\n\n${noteBlock}` : noteBlock;

  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: number,
    body: newBody,
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
