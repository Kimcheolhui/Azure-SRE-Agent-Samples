import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const chapterCounts = [5, 7, 22, 15, 18, 31, 7];
const chapterNames = ["운영 문제", "제품 개요", "조사", "팀 맥락과 확장",
  "조치와 실행 통제", "반복 운영과 기업 환경", "한계와 도입 판단"];

export function createCurriculum(sourceText) {
  const source = JSON.parse(sourceText);
  assert.ok(Array.isArray(source), "Study source must be an array");
  const sections = source.filter(section => section.phase >= 1 && section.phase <= 7).map(section => {
    assert.ok(section.id && section.title && section.introduction?.length && section.explanation?.length,
      `Incomplete source section: ${section.number}`);
    assert.ok(section.qa?.length, `Missing source questions: ${section.number}`);
    return {
      number: section.number,
      sourceId: section.id,
      chapter: section.phase,
      title: section.title,
      introduction: section.introduction,
      explanations: section.explanation.filter(part => part.heading !== "활용 설계 참고"),
      questions: section.qa,
      sources: section.sources
    };
  });
  return { version: 1, sourceSha256: createHash("sha256").update(sourceText).digest("hex"), sections };
}

function escape(text) {
  assert.equal(typeof text, "string", "Curriculum text must be a string");
  return text.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function renderCurriculum(curriculum) {
  const { sections } = curriculum;
  const numbers = new Set(sections.map(section => section.number));
  assert.equal(sections.length, 105, "Expected all 105 original sections");
  assert.equal(numbers.size, sections.length, "Duplicate curriculum sections");
  const blocks = [];
  for (let chapter = 1; chapter <= 7; chapter++) {
    const rows = sections.filter(section => section.chapter === chapter);
    assert.equal(rows.length, chapterCounts[chapter - 1], `Wrong count for chapter ${chapter}`);
    blocks.push(`<h3 id="recall-chapter-${chapter}">${chapterNames[chapter - 1]}</h3>`);
    for (let index = 1; index <= rows.length; index++) {
      const number = `${chapter}.${index}`;
      const section = rows.find(row => row.number === number);
      assert.ok(section, `Missing curriculum section: ${number}`);
      assert.ok(section.explanations?.length, `Missing topic explanations: ${number}`);
      for (const part of section.explanations) {
        assert.ok(part.heading && part.paragraphs?.length, `Incomplete topic explanation: ${number}`);
      }
      const cardId = `recall-${number.replace(".", "-")}`;
      const questions = section.questions.map(qa =>
        `<p><strong>참고 질문:</strong> ${escape(qa.question)}</p>`).join("\n");
      const answers = section.questions.map(qa => `<p>${escape(qa.answer)}</p>`).join("\n");
      const explanations = section.explanations.map(part =>
        `<h5>${escape(part.heading)}</h5>\n${part.paragraphs.map(text => `<p>${escape(text)}</p>`).join("\n")}`).join("\n");
      const sources = section.sources.map(url => {
        assert.ok(/^https:\/\//.test(url), `Invalid source URL: ${url}`);
        return `<a href="${escape(url)}">공식 근거</a>`;
      }).join(" · ");
      blocks.push(`<article class="recall-card" data-section="${number}" id="${cardId}">
<h4>${escape(section.title)}</h4>
<p><strong>주요 내용:</strong> ${section.explanations.map(part => escape(part.heading)).join(" / ")}</p>
${questions}
<details class="answer-key"><summary>설명 보기</summary>
${section.introduction.map(text => `<p>${escape(text)}</p>`).join("\n")}
${explanations}
${answers}
<p class="sources">${sources}</p>
</details>
</article>`);
    }
  }
  return blocks.join("\n");
}

export function insertCurriculum(html, rendered) {
  const start = "<!-- CURRICULUM_START -->";
  const end = "<!-- CURRICULUM_END -->";
  assert.equal(html.split(start).length, 2, "Expected one curriculum start marker");
  assert.equal(html.split(end).length, 2, "Expected one curriculum end marker");
  return html.replace(/<!-- CURRICULUM_START -->[\s\S]*?<!-- CURRICULUM_END -->/,
    `${start}\n${rendered}\n${end}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 1, "Usage: node scripts/build-curriculum.mjs [study-content.json|--check]");
  const check = args[0] === "--check";
  const dataPath = resolve(root, "docs/curriculum.json");
  const htmlPath = resolve(root, "docs/workshop.html");
  const curriculum = args[0] && !check ? createCurriculum(readFileSync(resolve(args[0]), "utf8")) :
    JSON.parse(readFileSync(dataPath, "utf8"));
  const html = readFileSync(htmlPath, "utf8");
  const updated = insertCurriculum(html, renderCurriculum(curriculum));
  if (check) {
    assert.equal(updated, html, "Embedded recall cards are out of sync with curriculum.json");
  } else {
    writeFileSync(dataPath, JSON.stringify(curriculum, null, 2) + "\n");
    writeFileSync(htmlPath, updated);
  }
  console.log(`Curriculum ${check ? "verified" : "built"}: 105 sections, 7 chapters, source ${curriculum.sourceSha256.slice(0, 12)}.`);
}
