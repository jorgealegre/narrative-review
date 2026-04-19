import * as core from "@actions/core";
import * as github from "@actions/github";

type Octokit = ReturnType<typeof github.getOctokit>;

const BRANCH = "gh-pages";

async function ensureBranch(octokit: Octokit, owner: string, repo: string): Promise<void> {
  try {
    await octokit.rest.repos.getBranch({ owner, repo, branch: BRANCH });
    return;
  } catch {
    // fall through to create orphan
  }

  // Create orphan branch via git refs API. repos.createOrUpdateFileContents
  // refuses to create branches, so we build blob -> tree -> commit -> ref manually.
  const [{ data: nojekyllBlob }, { data: indexBlob }] = await Promise.all([
    octokit.rest.git.createBlob({ owner, repo, content: "", encoding: "utf-8" }),
    octokit.rest.git.createBlob({
      owner,
      repo,
      content: "<!doctype html><title>Narrative Reviews</title><h1>Narrative Reviews</h1>",
      encoding: "utf-8",
    }),
  ]);

  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    tree: [
      { path: ".nojekyll", mode: "100644", type: "blob", sha: nojekyllBlob.sha },
      { path: "index.html", mode: "100644", type: "blob", sha: indexBlob.sha },
    ],
  });

  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: "Initialize gh-pages",
    tree: tree.sha,
    parents: [],
  });

  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${BRANCH}`,
    sha: commit.sha,
  });
  core.info(`Created orphan ${BRANCH} branch.`);
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
