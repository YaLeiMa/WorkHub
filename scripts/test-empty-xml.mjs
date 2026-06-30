import { jsonToXml } from "../src/lib/workhub/tools/jsonXml.ts";

const opts = {
  indent: 2,
  keepAttributes: false,
  xmlDeclaration: false,
  stripNsPrefix: true,
  unwrapFields: [],
  parseEmbeddedXml: false,
};

const json = `{"patCardType":"1","patCardNo":"K00411729","jydjh":""}`;
console.log("current:");
console.log(jsonToXml(json, opts));
