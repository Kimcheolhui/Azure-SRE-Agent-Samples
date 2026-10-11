import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderCurriculum, insertCurriculum } from "../build-curriculum.mjs";

const html = readFileSync(new URL("../../docs/workshop.html", import.meta.url), "utf8");
const curriculum = JSON.parse(readFileSync(new URL("../../docs/curriculum.json", import.meta.url), "utf8"));

test("all 105 reference topics render once without source mappings or grading", () => {
  const rendered = renderCurriculum(curriculum);
  assert.equal([...rendered.matchAll(/data-section="/g)].length, 105);
  assert.ok(!rendered.includes("data-score"));
  assert.ok(!rendered.includes("data-exercise"));
  assert.ok(!/원본 [1-8]\.\d|data-exercise|v2-[abc]-/.test(rendered));
  assert.equal(insertCurriculum(html, rendered), html);
});

test("curriculum rejects duplicated or missing source sections", () => {
  assert.throws(() => renderCurriculum({ sections: curriculum.sections.slice(1) }), /105/);
  const sections = [...curriculum.sections];
  sections[1] = sections[0];
  assert.throws(() => renderCurriculum({ sections }), /Duplicate/);
});

test("source text is escaped rather than interpreted as HTML", () => {
  const sections = curriculum.sections.map(section => ({ ...section }));
  sections[0].title = '<script>alert("test")</script>';
  const rendered = renderCurriculum({ sections });
  assert.ok(rendered.includes("&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;"));
  assert.ok(!rendered.includes('<script>alert("test")</script>'));
});

test("every explanation topic has its substantive paragraphs embedded in the answer key", () => {
  for (const section of curriculum.sections) {
    const rendered = renderCurriculum({
      ...curriculum,
      sections: curriculum.sections.map(row => row === section ? {
        ...row,
        explanations: row.explanations.map((part, index) => ({
          ...part, paragraphs: [...part.paragraphs, `topic-evidence-${section.number}-${index}`]
        }))
      } : row)
    });
    for (let index = 0; index < section.explanations.length; index++) {
      assert.ok(rendered.includes(`topic-evidence-${section.number}-${index}`));
    }
  }
});

test("topic headings without substantive explanations cannot pass validation", () => {
  const sections = curriculum.sections.map((section, index) => index === 0 ?
    { ...section, explanations: [{ heading: "Topic without explanation", paragraphs: [] }] } : section);
  assert.throws(() => renderCurriculum({ sections }), /Incomplete topic explanation/);
});
