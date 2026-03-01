/* eslint-disable @typescript-eslint/no-require-imports */
const { heroui } = require("@heroui/theme");

module.exports = {
  plugins: {
    "@tailwindcss/postcss": {
      plugins: [heroui()],
    },
  },
};
