import type { Config } from "tailwindcss";

import { createEditorialTailwindTheme } from "./src/client/theme/editorialTokens";

const config = {
  content: ["./src/client/index.html", "./src/client/**/*.{vue,ts,js,jsx,tsx,md}"],
  theme: createEditorialTailwindTheme(),
  plugins: []
} satisfies Config;

export default config;
