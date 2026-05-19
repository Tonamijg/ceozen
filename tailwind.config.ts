import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        /* Neon palette */
        neon: {
          blue:   "#00d4ff",
          violet: "#a855f7",
          pink:   "#ec4899",
          green:  "#22d3ee"
        },
        /* Dark backgrounds */
        dark: {
          950: "#050816",
          900: "#0a0f1e",
          800: "#0f1629",
          700: "#162033",
          600: "#1e2a3d"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      backgroundImage: {
        "gradient-neon":
          "linear-gradient(135deg, #00d4ff22 0%, #a855f722 50%, #050816 100%)",
        "card-glow":
          "linear-gradient(145deg, #0f162944 0%, #162033aa 100%)"
      },
      boxShadow: {
        neon:        "0 0 20px #00d4ff33, 0 0 40px #00d4ff11",
        "neon-violet":"0 0 20px #a855f733, 0 0 40px #a855f711",
        card:        "0 4px 24px #00000066, inset 0 1px 0 #ffffff08"
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float":      "float 6s ease-in-out infinite"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-10px)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
