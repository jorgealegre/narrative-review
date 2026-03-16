import * as github from "@actions/github";

type Octokit = ReturnType<typeof github.getOctokit>;

export async function createCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  headSha: string
): Promise<number> {
  const { data } = await octokit.rest.checks.create({
    owner,
    repo,
    name: "Narrative Review",
    head_sha: headSha,
    status: "in_progress",
    output: {
      title: "Narrative Review",
      summary: "Generating narrative review...",
    },
  });
  return data.id;
}

export async function completeCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  opts: {
    conclusion: "success" | "failure" | "neutral";
    summary: string;
    detailsUrl?: string;
  }
): Promise<void> {
  await octokit.rest.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: "completed",
    conclusion: opts.conclusion,
    details_url: opts.detailsUrl,
    output: {
      title: "Narrative Review",
      summary: opts.summary,
    },
  });
}
