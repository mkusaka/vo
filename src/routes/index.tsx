import { createFileRoute } from "@tanstack/react-router";

import { ViewerApp } from "../app/ViewerApp";

export const Route = createFileRoute("/")({
  component: ViewerApp,
});
