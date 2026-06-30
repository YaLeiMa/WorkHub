import fs from "node:fs";

const s = fs.readFileSync("dist/assets/index-BDkOj9fj.js", "utf8");
const start = s.indexOf("UT=qe");
const end = s.indexOf('VT={id:"json-xml"');
console.log("component length", end - start);
const part = s.slice(start, end);
console.log("tail:", part.slice(-800));
