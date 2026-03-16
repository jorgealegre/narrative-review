import React from "react";
import { createRoot } from "react-dom/client";
import { StaticReviewApp } from "./StaticReviewApp";
import "./tailwind.css";

function loadReviewData(): unknown {
  const el = document.getElementById("review-data");
  if (!el) return null;
  const b64 = (el.textContent || "").trim();
  if (!b64 || b64 === "%%REVIEW_DATA_B64%%") return null;
  try { return JSON.parse(atob(b64)); } catch { return null; }
}

const data = loadReviewData();
if (!data) {
  document.getElementById("root")!.innerHTML =
    '<div style="color:#a1a1aa;font-family:system-ui;padding:4rem;text-align:center">' +
    "<h1>No review data</h1><p>This template has not been populated with review data.</p></div>";
} else {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <StaticReviewApp data={data as { review: unknown; comments: unknown }} />
    </React.StrictMode>
  );
}
