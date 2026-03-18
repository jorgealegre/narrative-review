import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import * as path from "path";
import { fetchPRMetadata, fetchPRDiff, fetchPRComments, fetchFileContents, updatePRDescriptionWithNote } from "./github-api";
import { createCheckRun, completeCheckRun } from "./check-run";
import { deployToPages } from "./deploy";
import { parseDiff } from "../src/lib/diff-parser";
import { analyzeNarrative } from "../src/lib/analyzer";
import { verifyCoverage, buildUncategorizedChapter } from "../src/lib/coverage-verifier";
import type { ModelId, NarrativeReview, StaticReviewData } from "../src/lib/types";

async function run(): Promise<void> {
  const anthropicApiKey = core.getInput("anthropic-api-key", { required: true });
  const githubToken = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";
  const model = (core.getInput("model") || "claude-sonnet-4-6") as ModelId;
  const maxDiffSize = parseInt(core.getInput("max-diff-size") || "512000", 10);
  const maxLines = parseInt(core.getInput("max-lines") || "5000", 10);
  const maxCost = parseFloat(core.getInput("max-cost") || "2.00");
  const force = core.getInput("force") === "true";

  // Set the Anthropic API key for the SDK
  process.env.ANTHROPIC_API_KEY = anthropicApiKey;

  const octokit = github.getOctokit(githubToken);
  const { owner, repo } = github.context.repo;
  const prNumber = github.context.payload.pull_request?.number;
  const headSha = github.context.payload.pull_request?.head?.sha || github.context.sha;

  if (!prNumber) {
    core.setFailed("This action must be triggered by a pull_request event.");
    return;
  }

  // Create in-progress check run
  const checkRunId = await createCheckRun(octokit, owner, repo, headSha);

  try {
    // Fetch PR data in parallel
    const [prInfo, rawDiff, prComments] = await Promise.all([
      fetchPRMetadata(octokit, owner, repo, prNumber),
      fetchPRDiff(octokit, owner, repo, prNumber),
      fetchPRComments(octokit, owner, repo, prNumber),
    ]);

    // Guard checks (skipped when force=true)
    if (!force) {
      // Check diff size
      const diffBytes = Buffer.byteLength(rawDiff, "utf-8");
      if (diffBytes > maxDiffSize) {
        await completeCheckRun(octokit, owner, repo, checkRunId, {
          conclusion: "neutral",
          summary: `Skipped: diff too large (${Math.round(diffBytes / 1024)}KB, max ${Math.round(maxDiffSize / 1024)}KB).`,
        });
        core.info("Diff too large, skipping.");
        core.setOutput("skipped", "true");
        return;
      }

      // Check line count
      const totalLines = prInfo.additions + prInfo.deletions;
      if (totalLines > maxLines) {
        await completeCheckRun(octokit, owner, repo, checkRunId, {
          conclusion: "neutral",
          summary: `Skipped: too many lines changed (${totalLines}, max ${maxLines}).`,
        });
        core.info(`Too many lines (${totalLines}), skipping.`);
        core.setOutput("skipped", "true");
        return;
      }

      // Estimate cost before calling Claude
      const MODEL_INPUT_COST: Record<string, number> = {
        "claude-haiku-4-5-20251001": 1.0,
        "claude-sonnet-4-6": 3.0,
        "claude-opus-4-6": 5.0,
      };
      const MODEL_OUTPUT_COST: Record<string, number> = {
        "claude-haiku-4-5-20251001": 5.0,
        "claude-sonnet-4-6": 15.0,
        "claude-opus-4-6": 25.0,
      };
      const estInputTokens = Math.ceil(diffBytes / 4) + 3000; // diff + system prompt
      const estOutputTokens = 4000; // typical narrative output
      const estCost =
        (estInputTokens * (MODEL_INPUT_COST[model] || 3.0) +
          estOutputTokens * (MODEL_OUTPUT_COST[model] || 15.0)) /
        1_000_000;
      if (estCost > maxCost) {
        await completeCheckRun(octokit, owner, repo, checkRunId, {
          conclusion: "neutral",
          summary: `Skipped: estimated cost $${estCost.toFixed(2)} exceeds $${maxCost.toFixed(2)} cap.`,
        });
        core.info(`Estimated cost $${estCost.toFixed(2)} exceeds cap, skipping.`);
        core.setOutput("skipped", "true");
        return;
      }
      core.info(`Estimated cost: $${estCost.toFixed(2)}`);
    }

    // Run analysis pipeline
    core.info("Parsing diff...");
    const diff = parseDiff(rawDiff);

    core.info(`Analyzing with ${model}...`);
    const analysis = await analyzeNarrative(diff, prInfo.title, prInfo.body, { model });

    core.info("Verifying coverage...");
    const coverage = verifyCoverage(diff, analysis.chapters);
    const uncategorized = buildUncategorizedChapter(coverage);
    const chapters = uncategorized
      ? [...analysis.chapters, uncategorized]
      : analysis.chapters;

    // Assemble review
    const review: NarrativeReview = {
      prInfo,
      title: analysis.title,
      summary: analysis.summary,
      rootCause: analysis.rootCause,
      chapters,
      coverage,
      metrics: analysis.metrics,
      analyzedAt: new Date().toISOString(),
    };

    // Fetch file contents for expand-context feature
    const allFilePaths = [...new Set(chapters.flatMap((ch) => ch.hunks.map((h) => h.file)))];
    const nonDeletedPaths = allFilePaths.filter((p) => {
      const file = diff.files.find((f) => f.path === p);
      return file?.status !== "removed";
    });
    let fileContents: Record<string, string> = {};
    if (nonDeletedPaths.length > 0) {
      try {
        core.info(`Fetching file contents for ${nonDeletedPaths.length} files...`);
        fileContents = await fetchFileContents(octokit, owner, repo, headSha, nonDeletedPaths);
        core.info(`Fetched ${Object.keys(fileContents).length} file contents.`);
      } catch (e) {
        core.warning(`Failed to fetch file contents (non-fatal): ${e instanceof Error ? e.message : e}`);
      }
    }

    const staticData: StaticReviewData = { review, comments: prComments, fileContents };

    // Inject into HTML template
    const templatePath = path.join(__dirname, "template.html");
    const template = fs.readFileSync(templatePath, "utf-8");
    // Base64-encode JSON to completely avoid HTML injection issues
    const jsonB64 = Buffer.from(JSON.stringify(staticData)).toString("base64");
    const html = template.replace("%%REVIEW_DATA_B64%%", jsonB64);

    // Write HTML to output directory for artifact upload
    const outputDir = path.join(process.cwd(), "_narrative-review-output");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "index.html"), html, "utf-8");
    core.info("Review HTML written to artifact directory.");

    // Deploy to gh-pages
    let reviewUrl = "";
    try {
      core.info("Deploying to GitHub Pages...");
      await deployToPages(octokit, owner, repo, prNumber, html);
      core.info("Deployed to gh-pages branch.");

      // Determine Pages URL
      let pagesBaseUrl: string;
      try {
        const { data: pages } = await octokit.rest.repos.getPages({ owner, repo });
        pagesBaseUrl = pages.html_url || `https://${owner}.github.io/${repo}`;
      } catch {
        pagesBaseUrl = `https://${owner}.github.io/${repo}`;
      }
      pagesBaseUrl = pagesBaseUrl.replace(/\/$/, "");
      reviewUrl = `${pagesBaseUrl}/reviews/${prNumber}/`;
      core.info(`Review URL: ${reviewUrl}`);
    } catch (e) {
      core.warning(`Pages deploy failed (non-fatal): ${e instanceof Error ? e.message : e}`);
    }

    // Update PR description with review note block
    try {
      const artifactUrl = `https://github.com/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
      await updatePRDescriptionWithNote(octokit, owner, repo, prNumber, headSha, chapters.length, diff.files.length, reviewUrl || undefined, reviewUrl ? undefined : artifactUrl);
      core.info("Updated PR description with narrative review note.");
    } catch (e) {
      core.warning(`Failed to update PR description (non-fatal): ${e instanceof Error ? e.message : e}`);
    }

    // Complete check run
    await completeCheckRun(octokit, owner, repo, checkRunId, {
      conclusion: "success",
      summary: `Narrative review: ${chapters.length} chapters, ${diff.files.length} files.${reviewUrl ? `\n\n[View Review](${reviewUrl})` : ""}`,
      ...(reviewUrl ? { detailsUrl: reviewUrl } : {}),
    });

    core.setOutput("chapters", chapters.length.toString());
    core.setOutput("pr-number", prNumber.toString());
    core.setOutput("review-url", reviewUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.error(message);

    await completeCheckRun(octokit, owner, repo, checkRunId, {
      conclusion: "failure",
      summary: `Failed to generate narrative review: ${message}`,
    });

    core.setFailed(message);
  }
}

run();
