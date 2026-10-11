import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const chapterCounts = [5, 7, 22, 15, 18, 31, 7];
const chapterNames = ["운영 문제", "제품 개요", "조사", "팀 맥락과 확장",
  "조치와 실행 통제", "반복 운영과 기업 환경", "한계와 도입 판단"];

export function collectMappings(html) {
  const mappings = new Map();
  for (const [, attributes] of html.matchAll(/<section\b([^>]+)>/g)) {
    const id = attributes.match(/\bid="([^"]+)"/)?.[1];
    const ranges = attributes.match(/\bdata-covers="([^"]+)"/)?.[1];
    if (!ranges) continue;
    assert.ok(id, "Covered section requires an ID");
    for (const range of ranges.split(",")) {
      const match = range.trim().match(/^([1-7])\.(\d+)(?:-\1\.(\d+))?$/);
      assert.ok(match, `Invalid coverage range: ${range}`);
      const [, chapter, from, to = from] = match;
      assert.ok(Number(to) >= Number(from), `Reversed coverage range: ${range}`);
      for (let section = Number(from); section <= Number(to); section++) {
        const number = `${chapter}.${section}`;
        assert.ok(!mappings.has(number), `Duplicate coverage: ${number}`);
        mappings.set(number, id);
      }
    }
  }
  return mappings;
}

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
      topics: section.explanation.filter(part => part.heading !== "활용 설계 참고").map(part => part.heading),
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

export function renderCurriculum(curriculum, html) {
  const mappings = collectMappings(html);
  const { sections } = curriculum;
  const numbers = new Set(sections.map(section => section.number));
  assert.equal(sections.length, 105, "Expected all 105 original sections");
  assert.equal(numbers.size, sections.length, "Duplicate curriculum sections");
  assert.equal(mappings.size, sections.length, "Missing or extra workshop mappings");
  const blocks = [];
  for (let chapter = 1; chapter <= 7; chapter++) {
    const rows = sections.filter(section => section.chapter === chapter);
    assert.equal(rows.length, chapterCounts[chapter - 1], `Wrong count for chapter ${chapter}`);
    blocks.push(`<h3 id="recall-chapter-${chapter}">${chapter}장 · ${chapterNames[chapter - 1]} · ${rows.length}개 절</h3>`);
    for (let index = 1; index <= rows.length; index++) {
      const number = `${chapter}.${index}`;
      const section = rows.find(row => row.number === number);
      assert.ok(section, `Missing curriculum section: ${number}`);
      const exercise = mappings.get(number);
      assert.ok(exercise, `Unmapped curriculum section: ${number}`);
      const cardId = `recall-${number.replace(".", "-")}`;
      const questions = section.questions.map(qa =>
        `<p><strong>회상 질문:</strong> ${escape(qa.question)}</p>`).join("\n");
      const answers = section.questions.map(qa => `<p>${escape(qa.answer)}</p>`).join("\n");
      const sources = section.sources.map(url => {
        assert.ok(/^https:\/\//.test(url), `Invalid source URL: ${url}`);
        return `<a href="${escape(url)}">공식 근거</a>`;
      }).join(" · ");
      blocks.push(`<article class="recall-card" data-section="${number}" data-exercise="${exercise}" id="${cardId}">
<h4>${number} · ${escape(section.title)}</h4>
<p><strong>자료 없이 설명:</strong> ${section.topics.map(escape).join(" / ")}</p>
${questions}
<p><a href="#${exercise}">관련 실습으로 돌아가기</a> · 원본 ${number} (${escape(section.sourceId)})</p>
<details class="answer-key"><summary>원본 기준 해설 — 먼저 답하고 펼치기</summary>
${section.introduction.map(text => `<p>${escape(text)}</p>`).join("\n")}
${answers}
<p class="sources">${sources}</p>
</details>
<label for="score-${cardId}">이 절의 회상 자기점수 </label><select id="score-${cardId}" data-score="${number}" data-chapter="${chapter}"><option value="0">0 · 미학습 / 오답</option><option value="1">1 · 설명 또는 적용 부족</option><option value="2">2 · 설명·적용·한계 확인</option></select>
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
  const updated = insertCurriculum(html, renderCurriculum(curriculum, html));
  if (check) {
    assert.equal(updated, html, "Embedded recall cards are out of sync with curriculum.json");
  } else {
    writeFileSync(dataPath, JSON.stringify(curriculum, null, 2) + "\n");
    writeFileSync(htmlPath, updated);
  }
  console.log(`Curriculum ${check ? "verified" : "built"}: 105 sections, 7 chapters, source ${curriculum.sourceSha256.slice(0, 12)}.`);
}
