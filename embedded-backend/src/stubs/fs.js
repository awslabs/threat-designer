// stubs/fs.js
export const promises = {
  readFile: () => Promise.resolve(""),
  writeFile: () => Promise.resolve(),
  mkdir: () => Promise.resolve(),
  access: () => Promise.resolve(),
};

export const readFileSync = () => "";
export const writeFileSync = () => {};
export const existsSync = () => false;
export const mkdirSync = () => {};
export default {};
