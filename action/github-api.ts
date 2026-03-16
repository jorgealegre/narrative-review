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
