import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { financeApi } from "./server/devApi.ts";

export default defineConfig({
  plugins: [react(), financeApi()],
});
