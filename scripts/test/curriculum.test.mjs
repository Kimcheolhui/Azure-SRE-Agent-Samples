import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectMappings, renderCurriculum, insertCurriculum } from "../build-curriculum.mjs";

const html = readFileSync(new URL("../../docs/workshop.html", import.meta.url), "utf8");
const curriculum = JSON.parse(readFileSync(new URL("../../docs/curriculum.json", import.meta.url), "utf8"));

test("all 105 source sections map to exercises and recall cards exactly once", () => {
  const mappings = collectMappings(html);
  const rendered = renderCurriculum(curriculum, html);
  assert.equal(mappings.size, 105);
  assert.equal([...rendered.matchAll(/data-score="/g)].length, 105);
  assert.equal(insertCurriculum(html, rendered), html);
});

test("coverage rejects duplicates, reversed ranges and missing chapters", () => {
  assert.throws(() => collectMappings('<section id="a" data-covers="1.1,1.1">'), /Duplicate/);
  assert.throws(() => collectMappings('<section id="a" data-covers="1.5-1.1">'), /Reversed/);
  assert.throws(() => renderCurriculum(curriculum, html.replace('data-covers="7.1-7.7"', "")), /mappings/);
});

test("curriculum rejects duplicated or missing source sections", () => {
  assert.throws(() => renderCurriculum({ sections: curriculum.sections.slice(1) }, html), /105/);
  const sections = [...curriculum.sections];
  sections[1] = sections[0];
  assert.throws(() => renderCurriculum({ sections }, html), /Duplicate/);
});

test("source text is escaped rather than interpreted as HTML", () => {
  const sections = curriculum.sections.map(section => ({ ...section }));
  sections[0].title = '<script>alert("test")</script>';
  const rendered = renderCurriculum({ sections }, html);
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
    }, html);
    for (let index = 0; index < section.explanations.length; index++) {
      assert.ok(rendered.includes(`topic-evidence-${section.number}-${index}`));
    }
  }
});

test("topic headings without substantive explanations cannot pass validation", () => {
  const sections = curriculum.sections.map((section, index) => index === 0 ?
    { ...section, explanations: [{ heading: "Topic without explanation", paragraphs: [] }] } : section);
  assert.throws(() => renderCurriculum({ sections }, html), /Incomplete topic explanation/);
});
