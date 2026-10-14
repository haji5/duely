export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Gold "champion" scale, matching the --accent-* theme variables in index.css
        primary: {
          50: '#fff8e6',
          100: '#feedc0',
          200: '#fde08f',
          300: '#fbd05e',
          400: '#f7c24a',
          500: '#f5b82e',
          600: '#e0a51f',
          700: '#b98515',
          800: '#8a6310',
          900: '#5c420b',
        },
      },
      fontFamily: {
        'sans': ['Barlow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'display': ['"Big Shoulders Display"', 'Barlow', 'ui-sans-serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
