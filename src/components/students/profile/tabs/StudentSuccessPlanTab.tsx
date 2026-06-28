"use client";

import { useEffect, useState } from "react";
import { Loader2, ClipboardList } from "lucide-react";
import {
  getFamilyVision, getGrowthGoals, getSupportStrategies,
  getLearningProfile, getSSPTimeline,
  type FamilyVision, type GrowthGoal, type SupportStrategy,
  type LearningProfile, type SSPTimelineEntry,
} from "@/app/actions/successPlanActions";
import { FamilyVisionSection }     from "./ssp/FamilyVisionSection";
import { GrowthGoalsSection }      from "./ssp/GrowthGoalsSection";
import { SupportStrategiesSection } from "./ssp/SupportStrategiesSection";
import { LearningProfileSection }  from "./ssp/LearningProfileSection";
import { ReviewTimelineSection }   from "./ssp/ReviewTimelineSection";

interface Props {
  studentId: string;
  isAdmin:   boolean;
}

interface SSPData {
  vision:     FamilyVision | null;
  goals:      GrowthGoal[];
  strategies: SupportStrategy[];
  profile:    LearningProfile | null;
  timeline:   SSPTimelineEntry[];
}

export function StudentSuccessPlanTab({ studentId, isAdmin }: Props) {
  const [data, setData]     = useState<SSPData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getFamilyVision(studentId),
      getGrowthGoals(studentId),
      getSupportStrategies(studentId),
      getLearningProfile(studentId),
      getSSPTimeline(studentId),
    ]).then(([vision, goals, strategies, profile, timeline]) => {
      setData({ vision, goals, strategies, profile, timeline });
      setLoading(false);
    });
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sc-gray">
        <Loader2 className="size-5 animate-spin mr-2" />
        Loading Student Success Plan…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-sc-gray">
        <ClipboardList className="size-8 mx-auto mb-2 text-sc-gray-300" />
        <p className="text-body-md">Could not load the Success Plan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Section 1 — Family Vision */}
      <FamilyVisionSection
        studentId={studentId}
        initial={data.vision}
        isAdmin={isAdmin}
      />

      {/* Section 2 — Growth Goals */}
      <GrowthGoalsSection
        studentId={studentId}
        initial={data.goals}
        isAdmin={isAdmin}
      />

      {/* Section 3 — Support Strategies */}
      <SupportStrategiesSection
        studentId={studentId}
        initial={data.strategies}
        isAdmin={isAdmin}
      />

      {/* Section 4 — Learning Profile */}
      <LearningProfileSection
        studentId={studentId}
        initial={data.profile}
      />

      {/* Section 5 — Review Timeline (auto-generated) */}
      <ReviewTimelineSection initial={data.timeline} />
    </div>
  );
}
