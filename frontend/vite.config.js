import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",     // Force Vite to listen on all local network addresses
    port: 5173,
    strictPort: false,   // Auto-pick next free port if 5173 is busy
    cors: true,          // CRITICAL: Allows OBS to pull data from your browser
    allowedHosts: true,  // CRITICAL: Stops the "Blocked Host" error in OBS
  },
});