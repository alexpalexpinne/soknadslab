import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: [
        "**/playwright-report/**",
        "**/test-results/**",
        "**/reports/**",
        "**/.data/**",
      ],
    },
  },
});
