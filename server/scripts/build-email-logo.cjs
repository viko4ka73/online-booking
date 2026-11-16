// Export the same wordmark used by the website; PNG works in email clients.
const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { Resvg } = require("@resvg/resvg-js");
const source = resolve(__dirname,"../../client/public/igraem-logo.svg");
const output = resolve(__dirname,"../src/assets/email-logo.png");
const image = new Resvg(readFileSync(source,"utf8"), {
  fitTo:{mode:"width",value:672},
  background:"#203126",
  font:{loadSystemFonts:true,defaultFontFamily:"Arial"},
}).render();
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,image.asPng());
console.log("Exported website logo for email: 672 × 228 PNG.");
