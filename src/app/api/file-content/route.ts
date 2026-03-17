import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner");
    const repo = url.searchParams.get("repo");
    const number = url.searchParams.get("number");
    const filePath = url.searchParams.get("path");

    if (!owner || !repo || !number || !filePath) {
      return NextResponse.json({ error: "Missing required query parameters" }, { status: 400 });
    }

    const exec = (cmd: string) =>
      execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });

    const ref = exec(
      `gh pr view ${number} --repo ${owner}/${repo} --json headRefOid --jq .headRefOid`
    ).trim();

    const b64Content = exec(
      `gh api repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${ref} --jq .content`
    ).trim();

    const content = Buffer.from(b64Content, "base64").toString("utf-8");
    return NextResponse.json({ content });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
