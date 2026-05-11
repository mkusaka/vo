import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { voApiPlugin } from "./src/api-plugin.mts";

export default defineConfig({
  plugins: [
    voApiPlugin(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    host: "localhost",
    port: 6276,
    strictPort: false,
  },
});
