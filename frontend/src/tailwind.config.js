/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          lighter: "#EBF3F8",
          light: "#5B8CAE",
          DEFAULT: "#2D5D88",
          dark: "#1D3D5A",
          darker: "#122538",
        },
        sage: {
          lighter: "#EAF2EE",
          light: "#A2C5BA",
          DEFAULT: "#7CA99A",
          dark: "#5A8677",
          darker: "#3E5D53",
        },
        carbon: {
          light: "#4B5563",
          DEFAULT: "#2D3748",
          dark: "#1E242B",
        },
        background: "#F8FAFC",
        paper: "#FFFFFF",
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 0 2px 0 rgba(45, 93, 136, 0.08), 0 12px 24px -4px rgba(45, 93, 136, 0.06)",
        dropdown: "0 4px 20px 0 rgba(30, 36, 43, 0.12)",
      },
    },
  },
  plugins: [],
};