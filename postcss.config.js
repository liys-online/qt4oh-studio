const { heroui } = require("@heroui/theme");

module.exports = {
  plugins: {
    "@tailwindcss/postcss": {
      plugins: [heroui()],
    },
  },
};
