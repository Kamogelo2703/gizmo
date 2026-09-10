import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const MT5_API_TARGET = process.env.MT5_API_TARGET || "http://66.23.225.158";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/mt5-api": {
        target: MT5_API_TARGET,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/mt5-api/, ""),
      },
    },
  },
});
