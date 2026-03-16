import { FancyModeProvider } from "@/hooks/useFancyMode";
import { FancyModeToggle } from "@/components/FancyModeToggle";
import { ReviewContainer } from "@/components/ReviewContainer";
import type { NarrativeReview, PRComment } from "@/lib/types";

interface StaticReviewAppProps {
  data: {
    review: NarrativeReview;
    comments: PRComment[];
  };
}

export function StaticReviewApp({ data }: StaticReviewAppProps) {
  return (
    <FancyModeProvider>
      <ReviewContainer review={data.review} mode="static" />
      <FancyModeToggle />
    </FancyModeProvider>
  );
}
