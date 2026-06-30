import { jsonToXml, xmlToJson } from "../src/lib/workhub/tools/jsonXml.ts";

const opts = {
  indent: 2,
  keepAttributes: false,
  xmlDeclaration: false,
  stripNsPrefix: true,
  unwrapFields: ["Envelope", "Body", "Header"],
  parseEmbeddedXml: true,
};

console.log("j2x:", jsonToXml('{"hello":"world"}', opts));
console.log("x2j:", xmlToJson("<hello>world</hello>", opts));
