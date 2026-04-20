import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

// Mimic the key logic inline to verify ADMX parses and SyncML shape is correct.
const admx = readFileSync(new URL("../public/samples/DemoApp.admx", import.meta.url), "utf8");
const adml = readFileSync(new URL("../public/samples/en-US/DemoApp.adml", import.meta.url), "utf8");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (tagName, jPath) => {
    const paths = new Set([
      "policyDefinitions.policyNamespaces.using",
      "policyDefinitions.categories.category",
      "policyDefinitions.policies.policy",
      "policyDefinitions.supportedOn.definitions.definition",
      "policyDefinitionResources.resources.stringTable.string",
      "policyDefinitionResources.resources.presentationTable.presentation",
    ]);
    if (paths.has(String(jPath))) return true;
    if (tagName === "item") return true;
    return false;
  },
});

const admxDoc = parser.parse(admx);
const admlDoc = parser.parse(adml);

const policyCount = admxDoc.policyDefinitions.policies.policy.length;
const stringCount = admlDoc.policyDefinitionResources.resources.stringTable.string.length;
console.log(`parsed: ${policyCount} policies, ${stringCount} strings`);

const policies = admxDoc.policyDefinitions.policies.policy.map((p) => ({
  name: p["@_name"],
  class: p["@_class"],
  key: p["@_key"],
  valueName: p["@_valueName"],
  elementTags: p.elements ? Object.keys(p.elements).filter((k) => !k.startsWith("@_") && k !== "#text") : [],
}));
console.table(policies);
