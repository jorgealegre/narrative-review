import * as core from "@actions/core";
import * as github from "@actions/github";
import type { PRInfo, PRComment } from "../src/lib/types";

const COMMENT_MARKER = "<!-- narrative-review -->";

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

export async function deletePreviousNarrativeComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number
): Promise<number> {
  let deleted = 0;
  const iterator = octokit.paginate.iterator(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: number,
    per_page: 100,
  });

  for await (const { data } of iterator) {
    for (const comment of data) {
      if (comment.body?.includes(COMMENT_MARKER)) {
        try {
          await octokit.rest.issues.deleteComment({
            owner,
            repo,
            comment_id: comment.id,
          });
          deleted++;
        } catch (e) {
          core.warning(`Failed to delete comment ${comment.id}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  return deleted;
}

export async function postNarrativeComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  reviewUrl: string,
  chapterCount: number,
  fileCount: number
): Promise<void> {
  const body = `${COMMENT_MARKER}
## 📖 Narrative Review

AI-organized walkthrough of this PR's changes — ${chapterCount} chapters across ${fileCount} files.

**[View Narrative Review →](${reviewUrl})**
`;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: number,
    body,
  });
}
