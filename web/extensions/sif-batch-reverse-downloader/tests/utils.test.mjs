import assert from "node:assert/strict";
import {
  buildSifReverseUrl,
  downloadExtension,
  extractAsin,
  isSifDownload,
  normalizeConcurrency,
  parseAsins,
  suggestedFilename
} from "../utils.mjs";

const parsed = parseAsins("b0ff4hcvxt, B0FF4HCVXT\nB0FF4K7576 bad");
assert.deepEqual(parsed.accepted, ["B0FF4HCVXT", "B0FF4K7576"]);
assert.deepEqual(parsed.invalid, ["BAD"]);

const overflow = parseAsins(Array.from({ length: 16 }, (_, index) => `B0000000${index.toString(36).toUpperCase().padStart(2, "0")}`).join(" "));
assert.equal(overflow.accepted.length, 15);
assert.equal(overflow.overflow.length, 1);

const url = new URL(buildSifReverseUrl("B0FF4HCVXT"));
assert.equal(url.origin, "https://www.sif.com");
assert.equal(url.pathname, "/reverse");
assert.equal(url.searchParams.get("country"), "CA");
assert.equal(url.searchParams.get("asin"), "B0FF4HCVXT");
assert.equal(url.searchParams.get("isListingSearch"), "false");
assert.equal(new URL(buildSifReverseUrl("B0FF4HCVXT", "DE")).searchParams.get("country"), "DE");

assert.equal(normalizeConcurrency(0), 1);
assert.equal(normalizeConcurrency(3), 3);
assert.equal(normalizeConcurrency(99), 5);
assert.equal(extractAsin("https://www.sif.com/reverse?country=CA&asin=B0FF4HCVXT"), "B0FF4HCVXT");
assert.equal(downloadExtension({ filename: "report.csv" }), "csv");
assert.equal(suggestedFilename("B0FF4HCVXT", { filename: "report.xlsx" }, new Date(2026, 7, 13)), "Sif反查流量词_CA_B0FF4HCVXT_2026-08-13.xlsx");
assert.equal(suggestedFilename("B0FF4HCVXT", { filename: "report.xlsx" }, new Date(2026, 7, 13), "DE"), "Sif反查流量词_DE_B0FF4HCVXT_2026-08-13.xlsx");

console.log("utils.test.mjs: all assertions passed");

assert.equal(isSifDownload({referrer:'https://erp.lingxing.com/',url:'https://files.example/1254213275.xlsx'}),false);
assert.equal(isSifDownload({url:'https://example.com/B0FF4HCVXT.xlsx'}),false);
assert.equal(isSifDownload({url:'https://www.sif.com.evil.example/1254213275.xlsx'}),false);
assert.equal(isSifDownload({url:'https://example.com/?source=sif.com'}),false);
assert.equal(isSifDownload({filename:'Sif反查流量词_CA_B0FF4HCVXT.xlsx'}),false);
assert.equal(isSifDownload({referrer:'https://www.sif.com/reverse',url:'https://cdn.example/report.xlsx'}),true);
assert.equal(isSifDownload({url:'blob:https://www.sif.com/abc'}),true);
assert.equal(isSifDownload({referrer:'https://erp.lingxing.com/',url:'https://www.sif.com/report.xlsx'}),false);
