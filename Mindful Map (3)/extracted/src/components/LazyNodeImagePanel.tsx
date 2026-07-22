import { lazy } from "react";

export const LazyNodeImagePanel = lazy(() =>
  import("@/components/NodeImagePanel").then((m) => ({ default: m.NodeImagePanel })),
);
