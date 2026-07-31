# guide · 指南

**Welcome, and thank you.** This document explains how the NYUSH Course Planner
works, what it deliberately does and does not do today, an honest triage of the
gaps you identified, and — most importantly — how you can fix them **without
writing any code**.

**欢迎，也非常感谢。** 本文说明这个选课规划工具的工作原理、当前的设计边界、对你提出的问题的逐条核实，
以及最重要的一点：**你不需要写代码**也能直接改进它。

---

## 1. What this thing is · 这是什么

A free, unofficial four-year course planner for NYU Shanghai students. A student
picks their programs, drags courses onto eight semesters, and sees requirement
progress plus warnings. It is **not** a degree audit and has no authority.

一个免费、非官方的四年选课规划工具。学生选择专业方案、把课程拖进八个学期，就能看到毕业要求进度与各类警告。
它**不是**官方学位审核，没有任何权威性。

- **Live site:** the Vercel deployment (ask Ryan for the URL)
- **Code:** <https://github.com/Geemir/NYUSH-course-planner>
- **Stack:** Next.js + Postgres (Neon). You don't need to care about this.

### The one design rule that explains everything

> **The Bulletin is displayed faithfully; the computer's interpretation is separate and clearly marked "beta".**

Every requirement table on the Progress page is rendered **exactly as the NYU
Bulletin publishes it** — same headings, same order, same footnotes. Separately,
the app *tries* to interpret those rows into checkable rules. When it cannot
prove an interpretation is correct, it marks the row `unavailable`, refuses to
show a degree percentage, and just shows you the official text. **It would rather
say "I don't know" than quietly give a wrong answer.**

> **公告原文照实展示；程序的自动解读是另一层，并明确标注为 beta。**

进度页的每个要求表格都**严格按 NYU 公告原样呈现**。程序会尝试把这些行解析成可判定的规则，
但只要无法证明解析正确，就会把该行标为「无法判定」，不给出毕业百分比，只展示官方原文。
**它宁愿说「我不知道」，也不会悄悄给出错误答案。**

---

## 2. How data gets in · 数据从哪来

There are three separate channels. Understanding these is the key to
contributing.

| Channel | Source | Who can change it | How often |
|---|---|---|---|
| **Bulletin catalog** | Scraped from bulletins.nyu.edu | Automated sync, then human certification | Manual, on demand |
| **Corrections / overlays** | Human review of a reported problem | Maintainers, via the website | Anytime |
| **Curated rules** | Hand-authored equivalences, placements | Maintainers, via the website | Anytime |

The scraper never publishes automatically. It produces a *candidate*, which is
checked against a reviewed manifest, and only an explicit human step promotes it
to what students see. If a scrape looks wrong (courses vanish, structure
changes), it **fails closed** — students keep seeing the last good version.

抓取程序不会自动上线。它先生成候选数据，与人工审核过的清单比对，必须经过明确的人工步骤才会发布给学生。
如果抓取结果异常（课程消失、结构变化），系统会**拒绝发布**，学生继续看到上一个正常版本。

---

## 3. Your points, checked against the code · 你的意见逐条核实

I read your list and verified each item against the actual code and data rather
than guessing. Numbers below are measured from the current 810-course catalog.

我把你列的每一点都对照实际代码和数据核实过，而不是凭印象回答。以下数字来自当前 810 门课的目录。

| # | Your point | Verified status | Reality |
|---|---|---|---|
| 1 | 没有寒假暑假课的位置 | ✅ **Correct** | Only 8 terms exist (Y1F–Y4S). January and summer sessions cannot be represented at all. |
| 2 | 不会检查 prerequisite | ⚠️ **Half correct — and this is good news** | The engine **does** check prerequisites and emits "prerequisite missing" / "can be taken concurrently" warnings. The problem is **data**: only **14 of 810 courses (2%)** have machine-readable prerequisites, while **619 courses have prerequisite text** sitting unparsed. Your proposed fix (map the text to course numbers) is exactly right, and the plumbing already exists. |
| 3 | 没有 Calculus / ICP 的 place-out | ⚠️ **Correct in effect** | The mechanism exists (a student can record a *waiver*, *exam*, or *manual confirmation* against a requirement), but **no placement rules are configured**, so nothing prompts them. |
| 4 | overload 只显示警告 | ✅ **Correct** | Above 18 credits it warns; there is no tuition estimate. Your idea (show the extra tuition) is a genuinely new feature. |
| 5 | 官网开课信息滞后 (e.g. EGB) | ✅ **Correct, and it is our biggest data weakness** | Term availability comes **only** from the Bulletin. Only **382 of 810 courses** have any term recorded; the rest are "unknown". We do not read Albert's live schedule. |
| 6 | double count 没做 | ⚠️ **Half correct** | A double-count budget engine exists (with a per-major limit), but it is **not enforced** for the newer Bulletin-derived programs — so in practice you are right that it doesn't work. |
| 7 | 美国/上海课程对等认证 | ✅ **Correct** | The `equivalentTo` field exists on every course and the engine honours it — but **0 of 810 courses** have any equivalence recorded. This is the single highest-value thing you could contribute. |
| 8 | DS 毕设选高阶课回扣 | ✅ **Correct** | Not modelled at all. |
| 9 | fulfillment 涵盖不全 | ✅ **Correct** | **536 of 810** courses are mapped to a requirement; **274 are not**. |
| 10 | spring 不开的课上下都可选 | ✅ Same root cause as #5 | Stale/absent Bulletin term data. |

**Summary:** most of what you identified is **missing data, not missing
software**. Prerequisites, equivalences, and place-outs all have working engines
sitting idle because nobody has filled in the facts. That is precisely where a
domain expert beats another programmer.

**小结：** 你指出的问题大多是**数据缺失，而非功能缺失**。先修课、课程对等、免修等机制都已经写好了，
只是没人填内容。这正是领域专家比再多一个程序员更有价值的地方。

---

## 4. How you can contribute — no coding required · 无需编程的参与方式

### Option A — the website itself (easiest, recommended first)

Ryan can give your NYU account the **maintainer** role. You then get an `/admin`
page in the site with web forms:

- **Catalog maintenance** — edit a course: credits, terms offered, prerequisites,
  which requirement it fulfils, equivalences.
- **Requirement maintenance** — correct how a program's requirement was
  interpreted.
- **Correction Hub** — review problems reported by students, and approve or
  reject the fix.

Everything is a form, everything is reviewable, and every change is recorded with
who made it and when. Nothing you do can silently break the site: edits become
*overlays* on top of the immutable official snapshot, and can be reverted.

Ryan 可以把你的 NYU 账号设为 **maintainer**。之后你在网站上会看到 `/admin` 管理页，全部是网页表单：
课程维护（学分、开课学期、先修课、满足哪条要求、对等课程）、要求维护、以及学生报错的审核中心。
所有改动都有记录、可回滚，不会静默破坏网站。

### Option B — spreadsheets (best for bulk knowledge)

For the big-ticket items, a spreadsheet is far faster than clicking. Fill any of
these and hand the file back; it gets imported and reviewed:

**B1. NYC ↔ Shanghai equivalences** (highest value)

| nyc_course | shanghai_equivalent | notes |
|---|---|---|
| `CSCI-UA 101` | `CSCI-SHU 101` | confirmed by CS advising, 2025 |

**B2. Real term availability** (fixes the EGB-style problem)

| course_code | actually_offered | bulletin_says | evidence |
|---|---|---|---|
| `EGB-SHU ...` | `fall, spring` | `spring` | AA confirmed, 2026 |

**B3. Prerequisites** (only where the Bulletin text is wrong or absent)

| course_code | prerequisites | notes |
|---|---|---|
| `CSCI-SHU 210` | `CSCI-SHU 101 OR CSCI-SHU 11` | "or" = either satisfies |

**B4. Place-out / placement rules**

| requirement | how_to_place_out | evidence |
|---|---|---|
| Calculus | AP Calc BC ≥ 4, or placement exam | Bulletin + AA |

Use **exact course codes** (`CSCI-SHU 101`). Where a rule is "either/or", say so.
Where you are unsure, write "unsure" — an honest gap is more useful than a guess,
because a wrong rule silently misleads students.

请使用**准确的课程代码**。「二选一」请注明。不确定的地方直接写「不确定」——
诚实的空白比猜测更有价值，因为错误的规则会悄悄误导学生。

### Option C — just talk

Reviewing a program page and saying "this is wrong because…" is genuinely
valuable. Screenshots and voice notes are fine.

---

## 5. What we plan to build · 后续开发计划

Ordered by (your impact) ÷ (effort). Items 1–4 are largely *your* list.

1. **Winter / summer session slots** — extend the plan beyond 8 terms. *(your #1)*
2. **Prerequisite backfill** — machine-parse the 619 existing prerequisite texts
   into checkable rules, with human review. *(your #2)*
3. **Course equivalences** — import your NYC↔SH table so study-away courses count
   correctly. *(your #7)*
4. **Real offering data** — record actual term availability where the Bulletin is
   stale, with the evidence attached. *(your #5, #10)*
5. **Place-out / exam credit** — configure Calculus/ICP placement. *(your #3)*
6. **Overload cost estimate** — show extra tuition, not just a warning. *(your #4)*
7. **Enforce double-counting** for Bulletin programs. *(your #6)*
8. **DS capstone modelling** — the "pick a higher-level CS/DS course, then credit
   it back" mechanic. *(your #8)*
9. **Fulfillment coverage** — map the remaining 274 courses. *(your #9)*

Already in progress and paused for this document: an always-visible progress
summary, a first-run guided tour, clickable warnings, and Chinese translation of
Bulletin prose (English stays authoritative).

---

## 6. Ground rules we will not bend · 我们坚持的原则

These exist to protect students, and any contribution needs to fit inside them.

1. **The official Bulletin text is always shown, unedited.** Corrections are
   layered on top, never in place of it.
2. **We never fake certainty.** If a rule can't be proven, the app says so rather
   than showing a confident wrong number.
3. **Every correction is attributable and reversible.**
4. **The planner is advisory.** It never tells a student they *will* graduate —
   only what the Bulletin says and where their plan disagrees.

原则：官方原文永远原样展示；无法确定时明确说「不确定」，绝不伪造确定性；每条更正都可追溯、可回滚；
本工具仅供参考，绝不替代学业导师与官方审核。

---

## 7. Getting started · 如何开始

1. Tell Ryan (Tell me) your `@nyu.edu` address → he grants the maintainer role.
2. Open the site, sign in, visit `/admin`, and look around. Nothing there can be
   published without review.
3. Start with **one program you know best** (e.g. DS or CS) and list what's wrong.
4. If bulk data is easier, start with the **NYC↔Shanghai equivalence sheet** — it
   is currently completely empty and blocks the whole study-away feature.

Questions, corrections, or disagreements with anything above: mg8974@nyu.edu.
If something in this document is wrong, please say so — it was written by reading
the code, and the code changes.
