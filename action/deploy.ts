import * as core from "@actions/core";
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
    // Add .nojekyll so Pages serves files with leading underscores as-is
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: ".nojekyll",
      message: "Disable Jekyll processing",
      content: "",
      branch: BRANCH,
    });
  }
}

async function ensurePagesEnabled(octokit: Octokit, owner: string, repo: string): Promise<void> {
  try {
    await octokit.rest.repos.getPages({ owner, repo });
    // Already enabled — nothing to do
    return;
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status !== 404) {
      core.warning(`Could not read Pages config (non-fatal): ${e instanceof Error ? e.message : e}`);
      return;
    }
  }

  try {
    await octokit.rest.repos.createPagesSite({
      owner,
      repo,
      source: { branch: BRANCH, path: "/" },
    });
    core.info(`Enabled GitHub Pages on ${owner}/${repo} (source: ${BRANCH}).`);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 409) {
      // Race: someone else enabled it between our checks
      return;
    }
    if (status === 403) {
      core.warning(
        "Token lacks permission to enable GitHub Pages. " +
          "Add 'pages: write' to your workflow permissions, or enable Pages manually: " +
          `https://github.com/${owner}/${repo}/settings/pages (Source: gh-pages branch).`
      );
      return;
    }
    core.warning(`Failed to enable GitHub Pages (non-fatal): ${e instanceof Error ? e.message : e}`);
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
  await ensurePagesEnabled(octokit, owner, repo);

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
