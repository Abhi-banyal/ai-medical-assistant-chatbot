/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6",      // brighter blue
        secondary: "#06b6d4",    // cyan
        accent: "#14b8a6",       // teal
        dark: "#0f172a",
        light: "#f1f5f9",
        
        // NEW COLORS 
        softBlue: "#e0f2fe",
        softGreen: "#dcfce7",
        softPurple: "#ede9fe",
        softOrange: "#fff7ed",
        softPink: "#fdf2f8",

        // 👇 NEW modern colors
        glass: "rgba(255,255,255,0.6)",
        borderLight: "rgba(255,255,255,0.3)"
      },

      backgroundImage: {
        // 🔥 gradient backgrounds
        "main-gradient": "linear-gradient(135deg, #e0f2fe, #dbeafe, #cffafe)",
        "card-gradient": "linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.4))",
        "button-gradient": "linear-gradient(to right, #3b82f6, #06b6d4)"
      },

      boxShadow: {
        soft: "0 20px 60px rgba(0,0,0,0.08)",
        card: "0 10px 30px rgba(0,0,0,0.06)",
        glow: "0 0 20px rgba(59,130,246,0.4)" // 🔥 glow effect
      },

      borderRadius: {
        card: "20px",
        xl: "16px",
        "2xl": "24px"
      },

      backdropBlur: {
        glass: "12px"
      }
    }
  },
  plugins: []
};