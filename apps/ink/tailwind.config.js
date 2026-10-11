/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // The writing desk — paper, ink, the editor's pencil, a walnut-brown pen.
        desk: {
          DEFAULT: "#E7E9E6",
          deep: "#DCDFDC",
        },
        paper: {
          DEFAULT: "#FBFBF9",
          dim: "#F2F3F0",
          edge: "#E4E6E2",
        },
        ink: {
          DEFAULT: "#1B1E21",
          soft: "#3F454B",
          faint: "#6D747A",
          ghost: "#9CA3A7",
        },
        line: {
          DEFAULT: "#D9DCd8",
          strong: "#C3C8C3",
        },
        pencil: {
          DEFAULT: "#AE3A24",
          deep: "#8F2E1B",
          wash: "#F5E7E2",
        },
        manila: {
          DEFAULT: "#9C7B46",
          wash: "#EEE7D8",
        },
        fountain: {
          DEFAULT: "#31518C",
          wash: "#E4EAF4",
        },
        walnut: {
          DEFAULT: "#7B5B33",
          deep: "#5F4423",
          wash: "#F0E8DB",
        },
      },
      borderRadius: {
        DEFAULT: "3px",
        sm: "2px",
        md: "4px",
        lg: "6px",
        full: "9999px",
      },
      fontFamily: {
        serif: ["Spectral", "Georgia", "serif"],
        sans: ["Archivo", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "1.4" }],
      },
      boxShadow: {
        sheet: "0 1px 0 rgba(27,30,33,0.04), 0 12px 40px -16px rgba(27,30,33,0.22)",
        lift: "0 2px 8px -2px rgba(27,30,33,0.12), 0 12px 32px -16px rgba(27,30,33,0.16)",
        pop: "0 4px 16px -4px rgba(27,30,33,0.18), 0 16px 48px -16px rgba(27,30,33,0.24)",
      },
      transitionTimingFunction: {
        "out-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
        "in-out-soft": "cubic-bezier(0.45, 0, 0.15, 1)",
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
    require('@tailwindcss/typography')
  ],
}
