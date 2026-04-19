import * as core from "@actions/core";
import * as github from "@actions/github";
import * as crypto from "crypto";

type Octokit = ReturnType<typeof github.getOctokit>;

const BRANCH = "gh-pages";

// robots.txt content served at the Pages site root. Doesn't stop intentional
// access, does stop Google/Bing/etc. from indexing review URLs.
const ROBOTS_TXT = `User-agent: *
Disallow: /
`;

const ROOT_INDEX_HTML = `<!doctype html>
<meta name="robots" content="noindex,nofollow">
<title>Narrative Reviews</title>
<h1>Narrative Reviews</h1>
<p>This site hosts per-PR narrative reviews. Reviews are only discoverable via the URL posted on each PR — there is no index.</p>
`;

async function ensureBranch(octokit: Octokit, owner: string, repo: string): Promise<void> {
  try {
    await octokit.rest.repos.getBranch({ owner, repo, branch: BRANCH });
    // Branch exists — make sure robots.txt is present (idempotent, no-op if already there)
    await ensureRobotsTxt(octokit, owner, repo);
    return;
  } catch {
    // fall through to create orphan
  }

  // Create orphan branch via git refs API. repos.createOrUpdateFileContents
  // refuses to create branches, so we build blob -> tree -> commit -> ref manually.
  const [{ data: nojekyllBlob }, { data: indexBlob }, { data: robotsBlob }] = await Promise.all([
    octokit.rest.git.createBlob({ owner, repo, content: "", encoding: "utf-8" }),
    octokit.rest.git.createBlob({ owner, repo, content: ROOT_INDEX_HTML, encoding: "utf-8" }),
    octokit.rest.git.createBlob({ owner, repo, content: ROBOTS_TXT, encoding: "utf-8" }),
  ]);

  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    tree: [
      { path: ".nojekyll", mode: "100644", type: "blob", sha: nojekyllBlob.sha },
      { path: "index.html", mode: "100644", type: "blob", sha: indexBlob.sha },
      { path: "robots.txt", mode: "100644", type: "blob", sha: robotsBlob.sha },
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

async function ensureRobotsTxt(octokit: Octokit, owner: string, repo: string): Promise<void> {
  try {
    await octokit.rest.repos.getContent({ owner, repo, path: "robots.txt", ref: BRANCH });
    return;
  } catch {
    // missing — create
  }
  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: "robots.txt",
      message: "Add robots.txt to block indexing",
      content: Buffer.from(ROBOTS_TXT).toString("base64"),
      branch: BRANCH,
    });
  } catch (e) {
    core.warning(`Could not write robots.txt (non-fatal): ${e instanceof Error ? e.message : e}`);
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

// Look for an existing reviews/<prNumber>-<slug>/ directory. If found, reuse
// the slug so retriggers on the same PR keep a stable URL across runs.
async function findExistingSlug(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string | undefined> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "reviews",
      ref: BRANCH,
    });
    if (!Array.isArray(data)) return undefined;
    const prefix = `${prNumber}-`;
    const match = data.find((entry) => entry.type === "dir" && entry.name.startsWith(prefix));
    if (match) return match.name.slice(prefix.length);
  } catch {
    // reviews/ dir doesn't exist yet
  }
  return undefined;
}

export async function deployToPages(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  htmlContent: string
): Promise<{ pathSegment: string }> {
  await ensureBranch(octokit, owner, repo);
  await ensurePagesEnabled(octokit, owner, repo);

  // Layer 2: unguessable random slug per PR. 16 bytes = 128 bits of entropy,
  // enough that URL-guessing attacks are infeasible. Reuse an existing slug
  // for the same PR so the URL is stable across retriggers.
  const existing = await findExistingSlug(octokit, owner, repo, prNumber);
  const slug = existing || crypto.randomBytes(16).toString("hex");
  const pathSegment = `${prNumber}-${slug}`;
  const filePath = `reviews/${pathSegment}/index.html`;
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

  return { pathSegment };
}
