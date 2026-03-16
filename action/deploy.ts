import * as github from "@actions/github";

type Octokit = ReturnType<typeof github.getOctokit>;

const BRANCH = "gh-pages";

async function ensureBranch(octokit: Octokit, owner: string, repo: string): Promise<void> {
  try {
    await octokit.rest.repos.getBranch({ owner, repo, branch: BRANCH });
  } catch {
    // Branch doesn't exist — create it with an initial file
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: "index.html",
      message: "Initialize gh-pages",
      content: Buffer.from("<html><body><h1>Narrative Reviews</h1></body></html>").toString("base64"),
      branch: BRANCH,
    });
  }
}

export async function deployToPages(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  htmlContent: string
): Promise<string> {
  await ensureBranch(octokit, owner, repo);

  const filePath = `reviews/${prNumber}/index.html`;
  const content = Buffer.from(htmlContent).toString("base64");

  // Check if file already exists (need SHA for updates)
  let existingSha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: BRANCH,
    });
    if (!Array.isArray(data) && data.type === "file") {
      existingSha = data.sha;
    }
  } catch {
    // File doesn't exist yet — that's fine
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: `Narrative review for PR #${prNumber}`,
    content,
    branch: BRANCH,
    ...(existingSha ? { sha: existingSha } : {}),
  });

  return filePath;
}
