import {
    useCallback,
    useMemo,
    useState,
  } from "react";
  
  import { useFocusEffect } from "@react-navigation/native";
  
  import { useAuth } from "../auth/AuthProvider";
  
  import { getDeltas } from "../store/deltas";
  import { getMeasurements } from "../store/measurements";
  import { getPlanItems } from "../store/planItems";
  import { getProjects } from "../store/projects";
  
  import { colors } from "../theme/colors";
  
  import type { Delta } from "../types/delta";
  import type { PlanItem } from "../types/plan";
  import type { Project } from "../types/project";
  
  import { summarizeDeltas } from "../utils/domain/summarizeDeltas";
  
  import {
    buildProjectSnapshots,
    type ProjectSnapshot,
  } from "../utils/domain/summarizeProjects";
  
  export default function useHomeDashboard() {
    const { user } = useAuth();
  
    const [
      measurementCount,
      setMeasurementCount,
    ] = useState(0);
  
    const [
      activeProjectCount,
      setActiveProjectCount,
    ] = useState(0);
  
    const [
      deltaSummary,
      setDeltaSummary,
    ] = useState(() =>
      summarizeDeltas([]),
    );
  
    const [
      snapshots,
      setSnapshots,
    ] = useState<ProjectSnapshot[]>([]);
  
    const [
      recentDeltas,
      setRecentDeltas,
    ] = useState<Delta[]>([]);
  
    const [
      projectsById,
      setProjectsById,
    ] = useState<Map<string, Project>>(
      () => new Map(),
    );
  
    const [
      planItemsById,
      setPlanItemsById,
    ] = useState<Map<string, PlanItem>>(
      () => new Map(),
    );
  
    useFocusEffect(
      useCallback(() => {
        if (!user?.uid) {
          setMeasurementCount(0);
          setActiveProjectCount(0);
  
          setDeltaSummary(
            summarizeDeltas([]),
          );
  
          setSnapshots([]);
          setRecentDeltas([]);
          setProjectsById(new Map());
          setPlanItemsById(new Map());
  
          return;
        }
  
        const ownerUid = user.uid;
  
        let active = true;
  
        async function load() {
          const [
            measurements,
            deltas,
            projects,
            planItems,
          ] = await Promise.all([
            getMeasurements(ownerUid),
            getDeltas(ownerUid),
            getProjects(ownerUid),
            getPlanItems(ownerUid),
          ]);
  
          if (!active) {
            return;
          }
  
          setMeasurementCount(
            measurements.length,
          );
  
          setActiveProjectCount(
            projects.filter(
              (project) =>
                project.status === "active",
            ).length,
          );
  
          setDeltaSummary(
            summarizeDeltas(deltas),
          );
  
          setSnapshots(
            buildProjectSnapshots(
              projects,
              deltas,
              3,
            ),
          );
  
          setRecentDeltas(
            [...deltas]
              .sort((a, b) =>
                b.createdAt.localeCompare(
                  a.createdAt,
                ),
              )
              .slice(0, 3),
          );
  
          setProjectsById(
            new Map(
              projects.map((project) => [
                project.id,
                project,
              ]),
            ),
          );
  
          setPlanItemsById(
            new Map(
              planItems.map((item) => [
                item.id,
                item,
              ]),
            ),
          );
        }
  
        void load();
  
        return () => {
          active = false;
        };
      }, [user?.uid]),
    );
  
    const operationalStatus =
      useMemo(() => {
        if (deltaSummary.openCount > 0) {
          return {
            text: `${deltaSummary.openCount} open ${
              deltaSummary.openCount === 1
                ? "Delta"
                : "Deltas"
            } need review`,
  
            accent: colors.delta,
  
            background: "#FFF8EB",
  
            icon:
              "alert-circle-outline" as const,
          };
        }
  
        return {
          text:
            "Field operations are clear",
  
          accent: colors.success,
  
          background: "#ECFDF3",
  
          icon:
            "checkmark-circle-outline" as const,
        };
      }, [deltaSummary.openCount]);
  
    return {
      measurementCount,
      activeProjectCount,
  
      deltaSummary,
  
      snapshots,
  
      recentDeltas,
  
      projectsById,
      planItemsById,
  
      operationalStatus,
    };
  }