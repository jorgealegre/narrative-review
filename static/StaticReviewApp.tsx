import { FancyModeProvider } from "@/hooks/useFancyMode";
import { FancyModeToggle } from "@/components/FancyModeToggle";
import { ReviewContainer } from "@/components/ReviewContainer";
import type { StaticReviewData } from "@/lib/types";

interface StaticReviewAppProps {
  data: StaticReviewData;
}

export function StaticReviewApp({ data }: StaticReviewAppProps) {
  return (
    <FancyModeProvider>
      <ReviewContainer review={data.review} mode="static" fileContents={data.fileContents} />
      <FancyModeToggle />
    </FancyModeProvider>
  );
}
